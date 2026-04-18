import fs from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import type { Session } from '../../server/types.js';

export function editFile(session: Session) {
  return tool({
    description: 'Replace `old` with `new` in a file. Errors if `old` is not unique unless `replaceAll` is true.',
    inputSchema: z.object({
      path: z.string(),
      old: z.string(),
      new: z.string(),
      replaceAll: z.boolean().optional(),
    }),
    execute: async ({ path: filePath, old, new: next, replaceAll }) => {
      const abs = path.isAbsolute(filePath) ? filePath : path.join(session.config.cwd, filePath);
      const raw = await fs.readFile(abs, 'utf8');
      if (replaceAll) {
        const updated = raw.split(old).join(next);
        await fs.writeFile(abs, updated, 'utf8');
        const count = raw.split(old).length - 1;
        return { path: abs, replacements: count };
      }
      const first = raw.indexOf(old);
      if (first < 0) throw new Error(`edit_file: string not found in ${abs}`);
      const second = raw.indexOf(old, first + old.length);
      if (second >= 0) throw new Error(`edit_file: \`old\` is not unique in ${abs}; pass replaceAll: true to replace all occurrences.`);
      const updated = raw.slice(0, first) + next + raw.slice(first + old.length);
      await fs.writeFile(abs, updated, 'utf8');
      return { path: abs, replacements: 1 };
    },
  });
}
