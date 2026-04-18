import fs from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import type { Session } from '../../server/types.js';

export function readFile(session: Session) {
  return tool({
    description: 'Read a file from disk. Returns content with 1-based line numbers. Supports offset/limit for partial reads.',
    inputSchema: z.object({
      path: z.string().describe('File path, absolute or relative to cwd.'),
      offset: z.number().int().min(0).optional().describe('Starting line (1-based). Default 1.'),
      limit: z.number().int().min(1).optional().describe('Max number of lines to read.'),
    }),
    execute: async ({ path: filePath, offset, limit }) => {
      const abs = path.isAbsolute(filePath) ? filePath : path.join(session.config.cwd, filePath);
      const raw = await fs.readFile(abs, 'utf8');
      const lines = raw.split('\n');
      const start = Math.max(0, (offset ?? 1) - 1);
      const end = limit ? Math.min(lines.length, start + limit) : lines.length;
      const out: string[] = [];
      for (let i = start; i < end; i++) {
        out.push(`${i + 1}\t${lines[i]}`);
      }
      return { path: abs, content: out.join('\n'), totalLines: lines.length };
    },
  });
}
