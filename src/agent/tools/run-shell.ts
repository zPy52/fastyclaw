import { tool } from 'ai';
import { execa } from 'execa';
import { z } from 'zod';
import type { Session } from '@/server/types';

export function runShell(session: Session) {
  return tool({
    description: 'Execute a shell command in the session cwd. Streams stdout/stderr as text deltas. Returns exit code and captured output.',
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
      timeoutMs: z.number().int().min(1).max(600_000).optional(),
    }),
    execute: async ({ command, cwd, timeoutMs }) => {
      const child = execa(command, {
        shell: true,
        cwd: cwd ?? session.config.cwd,
        timeout: timeoutMs,
        reject: false,
        all: false,
        cancelSignal: session.abort.signal,
      });
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      child.stdout?.on('data', (chunk: Buffer) => {
        const delta = chunk.toString('utf8');
        stdoutChunks.push(delta);
        session.stream.write({ type: 'text-delta', delta });
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const delta = chunk.toString('utf8');
        stderrChunks.push(delta);
        session.stream.write({ type: 'text-delta', delta });
      });
      const result = await child;
      return {
        exitCode: result.exitCode ?? null,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        timedOut: result.timedOut ?? false,
      };
    },
  });
}
