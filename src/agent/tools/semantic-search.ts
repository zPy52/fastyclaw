import fs from 'node:fs/promises';
import path from 'node:path';
import { openai } from '@ai-sdk/openai';
import { embed, embedMany, tool } from 'ai';
import { glob } from 'glob';
import { z } from 'zod';
import { Const } from '../../config/index.js';
import type { Session } from '../../server/types.js';

interface IndexEntry {
  file: string;
  chunk: string;
  start: number;
  embedding: number[];
}

const indexes = new WeakMap<Session, Map<string, IndexEntry[]>>();

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

function chunk(text: string, size = 2000): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  for (let i = 0; i < text.length; i += size) {
    out.push({ text: text.slice(i, i + size), start: i });
  }
  return out;
}

const TEXT_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,kt,rb,php,c,cc,cpp,h,hpp,cs,swift,md,txt,json,yaml,yml,toml,html,css,scss,sh}';

async function buildIndex(session: Session, root: string): Promise<IndexEntry[]> {
  const cache = indexes.get(session) ?? new Map<string, IndexEntry[]>();
  const cached = cache.get(root);
  if (cached) return cached;

  const files = await glob(TEXT_GLOB, {
    cwd: root,
    nodir: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
  });

  const entries: IndexEntry[] = [];
  const pending: Array<{ file: string; chunk: string; start: number }> = [];
  for (const rel of files) {
    const abs = path.join(root, rel);
    try {
      const stat = await fs.stat(abs);
      if (stat.size > 200_000) continue;
      const raw = await fs.readFile(abs, 'utf8');
      for (const c of chunk(raw)) {
        pending.push({ file: rel, chunk: c.text, start: c.start });
      }
    } catch {
      continue;
    }
  }

  const BATCH = 96;
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    const { embeddings } = await embedMany({
      model: openai.embedding(Const.embeddingModel),
      values: slice.map((s) => s.chunk),
      abortSignal: session.abort.signal,
    });
    for (let j = 0; j < slice.length; j++) {
      entries.push({ ...slice[j]!, embedding: embeddings[j]! });
    }
  }

  cache.set(root, entries);
  indexes.set(session, cache);
  return entries;
}

export function semanticSearch(session: Session) {
  return tool({
    description: 'Embed a query and rank code/text files under the search root by cosine similarity. Index is built lazily and cached per root.',
    inputSchema: z.object({
      query: z.string(),
      path: z.string().optional().describe('Root directory to search. Defaults to session cwd.'),
      k: z.number().int().min(1).max(50).optional().describe('Number of results to return. Default 8.'),
    }),
    execute: async ({ query, path: searchPath, k }) => {
      const root = searchPath
        ? (path.isAbsolute(searchPath) ? searchPath : path.join(session.config.cwd, searchPath))
        : session.config.cwd;
      const entries = await buildIndex(session, root);
      if (entries.length === 0) return { results: [] };
      const { embedding } = await embed({
        model: openai.embedding(Const.embeddingModel),
        value: query,
        abortSignal: session.abort.signal,
      });
      const scored = entries.map((e) => ({
        file: e.file,
        start: e.start,
        score: cosine(embedding, e.embedding),
        preview: e.chunk.slice(0, 200),
      }));
      scored.sort((a, b) => b.score - a.score);
      return { results: scored.slice(0, k ?? 8) };
    },
  });
}
