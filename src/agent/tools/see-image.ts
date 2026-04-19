import { z } from 'zod';
import { tool } from 'ai';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Run } from '@/server/types';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

function mimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'image/png';
}

export function seeImage(run: Run) {
  return tool({
    description: 'Load one or more images into context so the model can see them. Accepts absolute paths or paths relative to cwd.',
    inputSchema: z.object({
      paths: z.array(z.string()).min(1).describe('Image file paths (absolute or relative to cwd).'),
    }),
    execute: async ({ paths }) => {
      const results = await Promise.all(
        paths.map(async (p) => {
          const abs = path.isAbsolute(p) ? p : path.join(run.config.cwd, p);
          const data = await fs.readFile(abs);
          return { path: abs, data: data.toString('base64'), mediaType: mimeType(abs) };
        }),
      );
      return results;
    },
    toModelOutput({ output }) {
      return {
        type: 'content',
        value: (output as Array<{ path: string; data: string; mediaType: string }>).flatMap((img) => [
          { type: 'text' as const, text: `Image: ${img.path}` },
          { type: 'image-data' as const, data: img.data, mediaType: img.mediaType },
        ]),
      };
    },
  });
}
