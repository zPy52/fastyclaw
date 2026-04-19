import { z } from 'zod';
import { tool } from 'ai';
import type { Run } from '@/server/types';
import { getTerminal } from '@/agent/sessions/terminal';

const MAX_TAIL_BYTES = 64_000;

export function checkShell(run: Run) {
  return tool({
    description:
      'Inspect the persistent shell session: returns the recent transcript and whether a command is currently running.',
    inputSchema: z.object({
      tailBytes: z
        .number()
        .int()
        .min(1)
        .max(MAX_TAIL_BYTES)
        .optional()
        .describe(`Return only the last N bytes of the transcript (default ${MAX_TAIL_BYTES}).`),
    }),
    execute: async ({ tailBytes }) => {
      const term = getTerminal(run);
      const limit = tailBytes ?? MAX_TAIL_BYTES;
      const full = term.transcript;
      const transcript = full.length > limit ? full.slice(-limit) : full;
      const truncated = full.length > limit;
      const current = term.currentCommand;

      return {
        transcript,
        truncated,
        totalBytes: full.length,
        running: !!current && !current.done,
        currentCommand: current
          ? {
              commandId: current.id,
              command: current.command,
              elapsedMs: Date.now() - current.startedAt,
              done: current.done,
              exitCode: current.exitCode,
            }
          : null,
        closed: term.isClosed,
      };
    },
  });
}
