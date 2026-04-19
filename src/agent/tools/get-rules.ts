import fs from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import type { Session } from '@/server/types';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function getRules(session: Session) {
  return tool({
    description: 'Load all AGENTS.md files walking up from the session cwd to the filesystem root. Returns concatenated rules.',
    inputSchema: z.object({}),
    execute: async () => {
      const parts: { path: string; content: string }[] = [];
      let dir = path.resolve(session.config.cwd);
      while (true) {
        const file = path.join(dir, 'AGENTS.md');
        if (await exists(file)) {
          const content = await fs.readFile(file, 'utf8');
          parts.unshift({ path: file, content });
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      if (parts.length === 0) return { rules: '', files: [] };
      const rules = parts.map((p) => `# ${p.path}\n\n${p.content}`).join('\n\n---\n\n');
      return { rules, files: parts.map((p) => p.path) };
    },
  });
}
