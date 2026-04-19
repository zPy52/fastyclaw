import { tool } from 'ai';
import { glob } from 'glob';
import { z } from 'zod';
import type { Run } from '@/server/types';

export function fileSearch(run: Run) {
  return tool({
    description: 'Search for files matching a glob pattern, rooted at the configured cwd.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "src/**/*.ts").'),
    }),
    execute: async ({ pattern }) => {
      const matches = await glob(pattern, {
        cwd: run.config.cwd,
        nodir: true,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });
      return { matches };
    },
  });
}
