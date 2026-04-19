import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import type { Session } from '@/server/types';

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function webFetch(session: Session) {
  return tool({
    description: 'Fetch a URL, convert HTML to plain text, and optionally summarize with the session model.',
    inputSchema: z.object({
      url: z.string().url(),
      prompt: z.string().optional().describe('If provided, summarize the fetched text with this prompt.'),
    }),
    execute: async ({ url, prompt }) => {
      const res = await fetch(url, { signal: session.abort.signal });
      const body = await res.text();
      const text = htmlToText(body);
      if (!prompt) return { url, status: res.status, text: text.slice(0, 50_000) };
      const { text: summary } = await generateText({
        model: openai(session.config.model),
        system: 'Summarize the provided web page content according to the user prompt. Be concise and accurate.',
        prompt: `Prompt: ${prompt}\n\n---\n\n${text.slice(0, 50_000)}`,
        abortSignal: session.abort.signal,
      });
      return { url, status: res.status, summary };
    },
  });
}
