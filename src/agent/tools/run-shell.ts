import { z } from 'zod';
import { tool } from 'ai';
import type { Run } from '@/server/types';
import { getTerminal } from '@/agent/sessions/terminal';

const INITIAL_WAIT_MS = 2_000;

export function runShell(run: Run) {
  return tool({
    description:
      'Run a command in the persistent shell session. State (env vars, cwd, shell functions) is preserved across calls. The command runs in the background; if it does not finish within a short initial window, this returns with status="running" — use `sleep` to wait and `check_shell` to inspect the transcript.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute. Runs in the same bash session as previous calls.'),
    }),
    execute: async ({ command }) => {
      const term = getTerminal(run);
      const pending = term.start(command);
      run.stream.write({ type: 'text-delta', delta: `$ ${command}\n` });

      const finished = await term.wait(INITIAL_WAIT_MS);
      if (pending.output) {
        run.stream.write({ type: 'text-delta', delta: pending.output });
      }

      if (finished && pending.done) {
        return {
          status: 'completed' as const,
          commandId: pending.id,
          exitCode: pending.exitCode,
          output: pending.output,
        };
      }
      return {
        status: 'running' as const,
        commandId: pending.id,
        partialOutput: pending.output,
        elapsedMs: Date.now() - pending.startedAt,
        hint: 'Command is still running. Use the `sleep` tool to wait, then `check_shell` to read more output.',
      };
    },
  });
}
