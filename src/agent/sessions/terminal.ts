import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import type { Session } from '@/server/types';

const MAX_TRANSCRIPT_BYTES = 256_000;

interface RunningCommand {
  id: string;
  command: string;
  startedAt: number;
  output: string;
  done: boolean;
  exitCode: number | null;
}

export class TerminalSession {
  private child: ChildProcess;
  private transcriptBuf = '';
  private current: RunningCommand | null = null;
  private waiters: Array<() => void> = [];
  private closed = false;

  public constructor(cwd: string) {
    this.child = spawn('bash', ['--norc', '--noprofile'], {
      cwd,
      env: { ...process.env, PS1: '', PROMPT_COMMAND: '', TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout?.setEncoding('utf8');
    this.child.stderr?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.onData(chunk));
    this.child.stderr?.on('data', (chunk: string) => this.onData(chunk));
    this.child.on('exit', () => {
      this.closed = true;
      if (this.current && !this.current.done) {
        this.current.done = true;
      }
      this.notify();
    });
    this.child.on('error', () => {
      this.closed = true;
      this.notify();
    });
  }

  private onData(chunk: string): void {
    this.transcriptBuf += chunk;
    if (this.transcriptBuf.length > MAX_TRANSCRIPT_BYTES) {
      this.transcriptBuf = this.transcriptBuf.slice(-MAX_TRANSCRIPT_BYTES);
    }
    if (this.current && !this.current.done) {
      this.current.output += chunk;
      const marker = new RegExp(`__FASTYCLAW_DONE_${this.current.id}__:(-?\\d+)`);
      const match = marker.exec(this.current.output);
      if (match) {
        this.current.exitCode = parseInt(match[1], 10);
        this.current.output = TerminalSession.stripMarker(this.current.output);
        this.current.done = true;
        this.notify();
      }
    }
  }

  private notify(): void {
    const list = this.waiters;
    this.waiters = [];
    for (const w of list) w();
  }

  private static stripMarker(text: string): string {
    return text.replace(/\n?__FASTYCLAW_DONE_[a-f0-9]+__:-?\d+\n?/g, '');
  }

  public get transcript(): string {
    return TerminalSession.stripMarker(this.transcriptBuf);
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  public get currentCommand(): RunningCommand | null {
    return this.current;
  }

  public start(command: string): RunningCommand {
    if (this.closed) {
      throw new Error('Terminal session has been closed.');
    }
    if (this.current && !this.current.done) {
      throw new Error('Another command is still running. Use sleep or check_shell first.');
    }
    const id = crypto.randomBytes(6).toString('hex');
    const pending: RunningCommand = {
      id,
      command,
      startedAt: Date.now(),
      output: '',
      done: false,
      exitCode: null,
    };
    this.current = pending;
    const wrapped = `${command}\nprintf '\\n__FASTYCLAW_DONE_%s__:%d\\n' '${id}' "$?"\n`;
    this.child.stdin?.write(wrapped);
    return pending;
  }

  public wait(timeoutMs: number): Promise<boolean> {
    if (!this.current || this.current.done) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (val: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.waiters.push(() => {
        if (!this.current || this.current.done || this.closed) finish(true);
      });
    });
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.child.stdin?.end(); } catch { /* ignore */ }
    try { this.child.kill('SIGTERM'); } catch { /* ignore */ }
    this.notify();
  }
}

const handles = new WeakMap<Session, TerminalSession>();

export function getTerminal(session: Session): TerminalSession {
  let term = handles.get(session);
  if (!term || term.isClosed) {
    term = new TerminalSession(session.config.cwd);
    handles.set(session, term);
  }
  return term;
}

export function closeTerminal(session: Session): void {
  const term = handles.get(session);
  if (!term) return;
  handles.delete(session);
  term.close();
}
