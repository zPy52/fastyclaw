import { closeTerminal } from '@/agent/sessions/terminal';
import { closeBrowserSession } from '@/agent/sessions/browser';
import { SubmoduleFastyclawServerStream } from '@/server/stream';
import type { AppConfig, Run, Thread } from '@/server/types';

export function createRun(thread: Thread, config: AppConfig): Run {
  const abort = new AbortController();
  const stream = new SubmoduleFastyclawServerStream();
  const run: Run = {
    threadId: thread.id,
    thread,
    config,
    abort,
    stream,
    close: () => {
      try { abort.abort(); } catch { /* ignore */ }
      stream.end();
      closeTerminal(thread.id);
      void closeBrowserSession(thread.id);
    },
  };
  return run;
}
