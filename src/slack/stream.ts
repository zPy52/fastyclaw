import fs from 'node:fs';
import path from 'node:path';
import type { WebClient } from '@slack/web-api';
import { SubmoduleFastyclawServerStream } from '@/server/stream';
import type { ServerEvent } from '@/server/types';
import type { SendFilesResult, SendFileEntry } from '@/agent/tools/send-files';

const EDIT_INTERVAL_MS = 1200;
const SLACK_MAX = 12000;

export class SlackStream extends SubmoduleFastyclawServerStream {
  private buffer = '';
  private anchorTs: string | null = null;
  private lastSentText = '';
  private scheduled: NodeJS.Timeout | null = null;
  private lastEditAt = 0;
  private flushing: Promise<void> = Promise.resolve();
  private closedLocal = false;
  private readonly toolNames = new Map<string, string>();

  public constructor(
    private readonly client: WebClient,
    private readonly channel: string,
    private readonly threadTs: string,
    private readonly onOwnTs: (ts: string) => void,
  ) {
    super();
  }

  public async init(): Promise<void> {
    const res = await this.client.chat.postMessage({
      channel: this.channel,
      thread_ts: this.threadTs,
      text: '…',
    });
    const ts = (res.ts as string | undefined) ?? null;
    this.anchorTs = ts;
    this.lastSentText = '…';
    if (ts) this.onOwnTs(ts);
  }

  public override write(event: ServerEvent): void {
    if (this.closedLocal) return;
    switch (event.type) {
      case 'text-delta':
        this.buffer += event.delta;
        this.scheduleEdit();
        break;
      case 'tool-call':
        this.toolNames.set(event.toolCallId, event.name);
        break;
      case 'tool-result': {
        const name = this.toolNames.get(event.toolCallId);
        this.toolNames.delete(event.toolCallId);
        if (name === 'send_files') this.handleSendFilesResult(event.output);
        break;
      }
      case 'error':
        this.buffer += `\n⚠️ ${event.message}`;
        this.scheduleEdit(true);
        break;
      case 'done':
        this.scheduleEdit(true);
        break;
      case 'thread':
      default:
        break;
    }
  }

  public override end(): void {
    if (this.closedLocal) return;
    this.closedLocal = true;
    this.scheduleEdit(true);
  }

  public override isClosed(): boolean {
    return this.closedLocal;
  }

  public async drain(): Promise<void> {
    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }
    this.flushing = this.flushing.then(() => this.flushNow());
    await this.flushing;
  }

  private scheduleEdit(force = false): void {
    if (!this.anchorTs) return;
    const now = Date.now();
    const elapsed = now - this.lastEditAt;
    if (force || elapsed >= EDIT_INTERVAL_MS) {
      if (this.scheduled) {
        clearTimeout(this.scheduled);
        this.scheduled = null;
      }
      this.flushing = this.flushing.then(() => this.flushNow());
      return;
    }
    if (this.scheduled) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = null;
      this.flushing = this.flushing.then(() => this.flushNow());
    }, EDIT_INTERVAL_MS - elapsed);
  }

  private async flushNow(): Promise<void> {
    if (!this.anchorTs) return;
    const text = this.render();
    if (!text || text === this.lastSentText) return;
    this.lastEditAt = Date.now();
    try {
      await this.client.chat.update({ channel: this.channel, ts: this.anchorTs, text });
      this.lastSentText = text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[slack] chat.update failed: ${message}; reopening anchor`);
      try {
        const res = await this.client.chat.postMessage({
          channel: this.channel,
          thread_ts: this.threadTs,
          text,
        });
        const ts = (res.ts as string | undefined) ?? null;
        this.anchorTs = ts;
        this.lastSentText = text;
        if (ts) this.onOwnTs(ts);
      } catch (err2) {
        console.error(`[slack] reopen anchor failed: ${err2 instanceof Error ? err2.message : String(err2)}`);
      }
    }
  }

  private handleSendFilesResult(output: unknown): void {
    const res = output as SendFilesResult | undefined;
    if (!res || res.status !== 'ok' || res.files.length === 0) return;

    const files = res.files;
    const priorTs = this.anchorTs;
    const priorLastSent = this.lastSentText;
    const pendingText = this.buffer.length > 0 ? this.render() : null;

    this.anchorTs = null;
    this.lastSentText = '';
    this.buffer = '';
    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    this.flushing = this.flushing.then(async () => {
      if (priorTs && pendingText !== null && pendingText !== priorLastSent) {
        try {
          await this.client.chat.update({ channel: this.channel, ts: priorTs, text: pendingText });
        } catch (err) {
          console.error(`[slack] finalize chat.update failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      for (const file of files) {
        await this.sendAttachment(file);
      }
      try {
        const sent = await this.client.chat.postMessage({
          channel: this.channel,
          thread_ts: this.threadTs,
          text: '…',
        });
        const ts = (sent.ts as string | undefined) ?? null;
        this.anchorTs = ts;
        this.lastSentText = '…';
        this.lastEditAt = Date.now();
        if (ts) this.onOwnTs(ts);
        if (this.buffer.length > 0) this.scheduleEdit(true);
      } catch (err) {
        console.error(`[slack] anchor reopen failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private async sendAttachment(file: SendFileEntry): Promise<void> {
    try {
      const res = await this.client.files.uploadV2({
        channel_id: this.channel,
        thread_ts: this.threadTs,
        file: fs.createReadStream(file.path),
        filename: path.basename(file.path),
      });
      const uploaded = this.extractUploadedTs(res);
      if (uploaded) this.onOwnTs(uploaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[slack] files.uploadV2 (${file.path}) failed: ${message}`);
    }
  }

  private extractUploadedTs(res: unknown): string | null {
    if (!res || typeof res !== 'object') return null;
    const obj = res as { files?: Array<{ ts?: string }>; file?: { ts?: string } };
    if (Array.isArray(obj.files) && obj.files.length > 0 && typeof obj.files[0]?.ts === 'string') {
      return obj.files[0].ts;
    }
    if (obj.file && typeof obj.file.ts === 'string') return obj.file.ts;
    return null;
  }

  private render(): string {
    const body = this.buffer.length > 0 ? this.buffer : '…';
    if (body.length <= SLACK_MAX) return body;
    return body.slice(body.length - SLACK_MAX);
  }
}
