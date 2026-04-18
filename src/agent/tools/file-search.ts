import { tool } from 'ai';
import { glob } from 'glob';
import { z } from 'zod';
import type { Session } from '../../server/types.js';

export function fileSearch(session: Session) {
  return tool({
    description: 'Search for files matching a glob pattern, rooted at the session cwd.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "src/**/*.ts").'),
    }),
    execute: async ({ pattern }) => {
      const matches = await glob(pattern, {
        cwd: session.config.cwd,
        nodir: true,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });
      return { matches };
    },
  });
}
