import crypto from 'node:crypto';
import { AgentRuntime } from '@/agent/index';
import { createRun } from '@/server/run';
import { FastyclawServer } from '@/server/index';
import type { Automation, AutomationRun } from '@/server/automations/types';
import type { SubmoduleFastyclawAutomationsStore } from '@/server/automations/store';
import type { UIMessage } from 'ai';
import type { AppConfig, Thread } from '@/server/types';

export class SubmoduleFastyclawAutomationsRunner {
  private busyThreads = new Set<string>();

  public constructor(private readonly store: SubmoduleFastyclawAutomationsStore) {}

  public isBusy(threadId: string): boolean {
    return this.busyThreads.has(threadId);
  }

  public async fire(a: Automation, opts: { manual?: boolean } = {}): Promise<{ runId: string; threadId: string }> {
    const runId = crypto.randomBytes(8).toString('base64url');

    let thread: Thread | null;
    if (a.mode.kind === 'attach') {
      thread = await FastyclawServer.threads.load(a.mode.threadId);
      if (!thread) {
        const skipped: AutomationRun = {
          runId,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          threadId: a.mode.threadId,
          status: 'skipped',
          reason: 'expired',
          error: 'attached thread not found',
        };
        await this.store.appendRun(a.id, skipped);
        await this.store.patch(a.id, { lastFiredAt: skipped.startedAt, lastError: skipped.error });
        return { runId, threadId: a.mode.threadId };
      }
    } else {
      thread = await FastyclawServer.threads.create();
    }

    if (this.busyThreads.has(thread.id)) {
      const skipped: AutomationRun = {
        runId,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        threadId: thread.id,
        status: 'skipped',
        reason: 'busy',
      };
      await this.store.appendRun(a.id, skipped);
      return { runId, threadId: thread.id };
    }

    const baseConfig = FastyclawServer.config.get();
    const runConfig: AppConfig = {
      ...baseConfig,
      cwd: a.cwd ?? baseConfig.cwd,
      model: a.model ?? baseConfig.model,
    };

    const promptOverride = await this.store.readPromptOverride(a.id);
    const promptText = promptOverride ?? a.prompt;

    const startedAt = new Date().toISOString();
    const runRow: AutomationRun = {
      runId,
      startedAt,
      threadId: thread.id,
      status: 'running',
    };
    await this.store.appendRun(a.id, runRow);

    FastyclawServer.threads.activate(thread);
    this.busyThreads.add(thread.id);
    const run = createRun(thread, runConfig);

    let status: AutomationRun['status'] = 'completed';
    let error: string | undefined;
    try {
      await AgentRuntime.loop.run(run, promptText, async (messages: UIMessage[]) => {
        thread!.messages = messages;
        await FastyclawServer.threads.save(thread!);
      });
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
    } finally {
      run.close();
      FastyclawServer.threads.deactivate(thread.id);
      this.busyThreads.delete(thread.id);
    }

    const finishedAt = new Date().toISOString();
    await this.store.patchRun(a.id, runId, { finishedAt, status, error });
    await this.store.patch(a.id, {
      lastFiredAt: startedAt,
      lastError: error,
    });

    if (a.trigger.kind === 'once' && !opts.manual) {
      await this.store.patch(a.id, { enabled: false });
    }

    return { runId, threadId: thread.id };
  }
}
