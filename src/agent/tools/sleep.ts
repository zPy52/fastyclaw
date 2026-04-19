import { z } from 'zod';
import { tool } from 'ai';
import type { Session } from '@/server/types';
import { getTerminal } from '@/agent/sessions/terminal';

const MIN_SECONDS = 3;
const MAX_SECONDS = 7_200;

export function sleep(session: Session) {
  return tool({
    description:
      'Wait for the currently running shell command to finish, up to `seconds` seconds (3 to 7200, i.e. up to 2 hours). Most waits should be under a few minutes. Returns as soon as the command completes.',
    inputSchema: z.object({
      seconds: z
        .number()
        .int()
        .min(MIN_SECONDS)
        .max(MAX_SECONDS)
        .describe('Maximum seconds to wait for the active command. Returns early if it finishes.'),
    }),
    execute: async ({ seconds }) => {
      const term = getTerminal(session);
      const current = term.currentCommand;
      if (!current) {
        return { status: 'idle' as const, message: 'No command is currently running.' };
      }
      if (current.done) {
        return {
          status: 'completed' as const,
          commandId: current.id,
          exitCode: current.exitCode,
          output: current.output,
          waitedMs: 0,
        };
      }
      const startedWait = Date.now();
      const finished = await term.wait(seconds * 1_000);
      const waitedMs = Date.now() - startedWait;

      if (finished && current.done) {
        if (current.output) {
          session.stream.write({ type: 'text-delta', delta: current.output });
        }
        return {
          status: 'completed' as const,
          commandId: current.id,
          exitCode: current.exitCode,
          output: current.output,
          waitedMs,
        };
      }
      return {
        status: 'running' as const,
        commandId: current.id,
        partialOutput: current.output,
        elapsedMs: Date.now() - current.startedAt,
        waitedMs,
        hint: 'Command still running after the requested wait. Call `sleep` again or `check_shell` to inspect output.',
      };
    },
  });
}
