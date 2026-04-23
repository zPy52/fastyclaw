import { z } from 'zod';
import { tool } from 'ai';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Run } from '@/server/types';

export type SendFileKind = 'photo' | 'video' | 'audio' | 'voice' | 'document';

export interface SendFileEntry {
  path: string;
  kind: SendFileKind;
  mediaType: string;
}

export interface SendFilesOkResult {
  status: 'ok';
  files: SendFileEntry[];
}

export interface SendFilesErrorResult {
  status: 'error';
  message: string;
}

export type SendFilesResult = SendFilesOkResult | SendFilesErrorResult;

const EXT_KIND: Record<string, { kind: SendFileKind; mediaType: string }> = {
  png: { kind: 'photo', mediaType: 'image/png' },
  jpg: { kind: 'photo', mediaType: 'image/jpeg' },
  jpeg: { kind: 'photo', mediaType: 'image/jpeg' },
  gif: { kind: 'photo', mediaType: 'image/gif' },
  webp: { kind: 'photo', mediaType: 'image/webp' },
  bmp: { kind: 'document', mediaType: 'image/bmp' },
  svg: { kind: 'document', mediaType: 'image/svg+xml' },
  mp4: { kind: 'video', mediaType: 'video/mp4' },
  mov: { kind: 'video', mediaType: 'video/quicktime' },
  webm: { kind: 'video', mediaType: 'video/webm' },
  mkv: { kind: 'video', mediaType: 'video/x-matroska' },
  mp3: { kind: 'audio', mediaType: 'audio/mpeg' },
  m4a: { kind: 'audio', mediaType: 'audio/mp4' },
  aac: { kind: 'audio', mediaType: 'audio/aac' },
  flac: { kind: 'audio', mediaType: 'audio/flac' },
  wav: { kind: 'audio', mediaType: 'audio/wav' },
  ogg: { kind: 'voice', mediaType: 'audio/ogg' },
  opus: { kind: 'voice', mediaType: 'audio/opus' },
};

function classify(filePath: string): { kind: SendFileKind; mediaType: string } {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_KIND[ext] ?? { kind: 'document', mediaType: 'application/octet-stream' };
}

export function sendFiles(run: Run) {
  return tool({
    description:
      'Deliver one or more files to the user (Telegram/WhatsApp/Slack/etc. attachments). Accepts absolute paths or paths relative to cwd. File type is inferred from extension so images, videos, audio, voice notes, and documents are all routed correctly. Use this after producing a file (screenshot, export, download) that the user should actually receive. Returns a short confirmation — the file bytes are NOT loaded back into the model context, so call a viewer tool (e.g. see_image, screenshot) separately if you also need to look at it.',
    inputSchema: z.object({
      paths: z
        .array(z.string())
        .min(1)
        .describe('File paths to send. Absolute or relative to cwd.'),
    }),
    execute: async ({ paths }): Promise<SendFilesResult> => {
      const files: SendFileEntry[] = [];
      for (const p of paths) {
        const abs = path.isAbsolute(p) ? p : path.join(run.config.cwd, p);
        try {
          const stat = await fs.stat(abs);
          if (!stat.isFile()) {
            return { status: 'error', message: `Not a regular file: ${abs}` };
          }
        } catch (err) {
          return { status: 'error', message: `Cannot read ${abs}: ${(err as Error).message}` };
        }
        const { kind, mediaType } = classify(abs);
        files.push({ path: abs, kind, mediaType });
      }
      return { status: 'ok', files };
    },
    toModelOutput({ output }) {
      const res = output as SendFilesResult;
      if (res.status === 'ok') {
        const summary = res.files
          .map((f) => `${path.basename(f.path)} (${f.kind})`)
          .join(', ');
        return {
          type: 'content',
          value: [{ type: 'text' as const, text: `Files sent: ${summary}` }],
        };
      }
      return {
        type: 'content',
        value: [{ type: 'text' as const, text: `send_files failed: ${res.message}` }],
      };
    },
  });
}
