import crypto from 'node:crypto';
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { Run } from '@/server/types';
import { AgentTools } from '@/agent/tools/index';
import { SubmoduleAgentRuntimePrompt } from '@/agent/prompt';
import { SubmoduleAgentRuntimeProvider } from '@/agent/provider/index';
import { SubmoduleAgentRuntimeCompaction } from '@/agent/compaction/index';

export class SubmoduleAgentRuntimeLoop {
  public constructor(
    private readonly prompt: SubmoduleAgentRuntimePrompt,
    private readonly provider: SubmoduleAgentRuntimeProvider,
    private readonly compaction: SubmoduleAgentRuntimeCompaction,
  ) {}

  public async run(
    run: Run,
    userText: string,
    onMessages: (messages: UIMessage[]) => Promise<void>,
  ): Promise<void> {
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: userText }],
    };
    run.thread.messages.push(userMessage);
    // Persist the user message eagerly so it survives crashes mid-response.
    await onMessages(run.thread.messages);

    try {
      const system = this.prompt.build(run);
      const tools = AgentTools.all(run);
      const toolSchemasJson = safeStringify(
        Object.fromEntries(
          Object.entries(tools).map(([name, t]) => [name, (t as { inputSchema?: unknown }).inputSchema ?? null]),
        ),
      );

      const lastUsage = run.thread.lastUsageTokens ?? null;
      try {
        const compRes = await this.compaction.maybeRun(run, system, toolSchemasJson, lastUsage);
        if (compRes) {
          run.stream.write({
            type: 'compaction',
            ranAt: compRes.ranAt,
            beforeTokens: compRes.beforeTokens,
            afterTokens: compRes.afterTokens,
            partsCompacted: compRes.partsCompacted,
          });
          await onMessages(run.thread.messages);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        run.stream.write({ type: 'error', message: `compaction failed: ${message}` });
      }

      const model = await this.provider.model(run.config);
      const result = streamText({
        model,
        system,
        messages: await convertToModelMessages(run.thread.messages),
        tools,
        stopWhen: stepCountIs(Number.MAX_SAFE_INTEGER),
        abortSignal: run.abort.signal,
        ...run.config.callOptions,
        providerOptions: run.config.providerOptions as ProviderOptions,
      });

      const uiStream = result.toUIMessageStream<UIMessage>({
        originalMessages: run.thread.messages,
        onFinish: async ({ messages }) => {
          run.thread.messages = messages;
          try {
            const usage = await result.usage;
            run.thread.lastUsageTokens = usage?.totalTokens ?? null;
          } catch {
            run.thread.lastUsageTokens = null;
          }
          await onMessages(run.thread.messages);
        },
      });

      for await (const chunk of uiStream) {
        if (run.stream.isClosed()) break;
        switch (chunk.type) {
          case 'text-delta':
            if (chunk.delta) run.stream.write({ type: 'text-delta', delta: chunk.delta });
            break;
          case 'tool-input-available':
            run.stream.write({
              type: 'tool-call',
              toolCallId: chunk.toolCallId,
              name: chunk.toolName,
              input: chunk.input,
            });
            break;
          case 'tool-output-available':
            run.stream.write({
              type: 'tool-result',
              toolCallId: chunk.toolCallId,
              output: chunk.output,
            });
            break;
          case 'tool-output-error':
            run.stream.write({ type: 'error', message: chunk.errorText });
            break;
          case 'error':
            run.stream.write({ type: 'error', message: chunk.errorText });
            break;
          default:
            break;
        }
      }

      run.stream.write({ type: 'done' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.stream.write({ type: 'error', message });
      run.stream.write({ type: 'done' });
    } finally {
      run.stream.end();
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
