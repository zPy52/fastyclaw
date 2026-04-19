import { stepCountIs, streamText } from 'ai';
import type { Session } from '@/server/types';
import { AgentTools } from '@/agent/tools/index';
import { SubmoduleAgentRuntimePrompt } from '@/agent/prompt';
import { SubmoduleAgentRuntimeProvider } from '@/agent/provider';


export class SubmoduleAgentRuntimeLoop {
  public constructor(
    private readonly prompt: SubmoduleAgentRuntimePrompt,
    private readonly provider: SubmoduleAgentRuntimeProvider,
  ) {}

  public async run(session: Session, userText: string): Promise<void> {
    session.messages.push({ role: 'user', content: userText });

    try {
      const result = streamText({
        model: this.provider.model(session.config.model, session.config.provider),
        system: this.prompt.build(session),
        messages: session.messages,
        tools: AgentTools.all(session),
        stopWhen: stepCountIs(Number.MAX_SAFE_INTEGER),
        abortSignal: session.abort.signal,
      });

      for await (const part of result.fullStream) {
        if (session.stream.isClosed()) break;
        switch (part.type) {
          case 'text-delta': {
            const delta = (part as { text?: string; textDelta?: string }).text
              ?? (part as { textDelta?: string }).textDelta
              ?? '';
            if (delta) session.stream.write({ type: 'text-delta', delta });
            break;
          }
          case 'tool-call': {
            session.stream.write({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              name: part.toolName,
              input: (part as { input?: unknown }).input,
            });
            break;
          }
          case 'tool-result': {
            session.stream.write({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              output: (part as { output?: unknown }).output,
            });
            break;
          }
          case 'error': {
            const err = (part as { error?: unknown }).error;
            const message = err instanceof Error ? err.message : String(err);
            session.stream.write({ type: 'error', message });
            break;
          }
          default:
            break;
        }
      }

      const response = await result.response;
      if (response?.messages) {
        session.messages.push(...response.messages);
      }
      session.stream.write({ type: 'done' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      session.stream.write({ type: 'error', message });
      session.stream.write({ type: 'done' });
    } finally {
      session.stream.end();
    }
  }
}
