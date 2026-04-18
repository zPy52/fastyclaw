import type { Response } from 'express';
import type { ServerEvent } from './types.js';

export class SubmoduleFastyclawServerStream {
  private res: Response | null = null;
  private closed = false;

  public attach(res: Response): void {
    this.res = res;
    this.closed = false;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }

  public write(event: ServerEvent): void {
    if (!this.res || this.closed) return;
    this.res.write(`event: ${event.type}\n`);
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  public end(): void {
    if (!this.res || this.closed) return;
    this.closed = true;
    this.res.end();
    this.res = null;
  }

  public isClosed(): boolean {
    return this.closed || this.res === null;
  }
}
