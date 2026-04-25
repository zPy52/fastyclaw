import path from 'node:path';
import { AttachmentBuilder, type Message, type TextBasedChannel } from 'discord.js';
import { SubmoduleFastyclawServerStream } from '@/server/stream';
import type { ServerEvent } from '@/server/types';
import type { SendFilesResult, SendFileEntry } from '@/agent/tools/send-files';

const EDIT_INTERVAL_MS = 800;
const DISCORD_MAX = 2000;
const ROLLOVER_AT = 1900;

type Sendable = TextBasedChannel & {
  send: (options: unknown) => Promise<Message>;
};

export class DiscordStream extends SubmoduleFastyclawServerStream {
  private buffer = '';
  private anchor: Message | null = null;
  private lastSentText = '';
  private scheduled: NodeJS.Timeout | null = null;
  private lastEditAt = 0;
  private flushing: Promise<void> = Promise.resolve();
  private closedLocal = false;
  private readonly toolNames = new Map<string, string>();
  private readonly sendable: Sendable;

  public constructor(channel: TextBasedChannel) {
    super();
    this.sendable = channel as Sendable;
  }

  public async init(): Promise<void> {
    const sent = await this.sendable.send({ content: '…' });
    this.anchor = sent;
    this.lastSentText = '…';
  }

  public override write(event: ServerEvent): void {
    if (this.closedLocal) return;
    switch (event.type) {
      case 'text-delta':
        this.buffer += event.delta;
        if (this.buffer.length > ROLLOVER_AT) {
          this.rolloverAnchor();
        } else {
          this.scheduleEdit();
        }
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
    if (!this.anchor) return;
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

  private rolloverAnchor(): void {
    const priorAnchor = this.anchor;
    const priorLastSent = this.lastSentText;
    const finalText = this.buffer.slice(0, DISCORD_MAX);
    const overflow = this.buffer.slice(DISCORD_MAX);

    this.anchor = null;
    this.buffer = overflow;
    this.lastSentText = '';
    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    this.flushing = this.flushing.then(async () => {
      if (priorAnchor && finalText && finalText !== priorLastSent) {
        try {
          await priorAnchor.edit({ content: finalText });
        } catch (err) {
          console.error(`[discord] rollover finalize failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      try {
        const sent = await this.sendable.send({ content: '…' });
        this.anchor = sent;
        this.lastSentText = '…';
        this.lastEditAt = Date.now();
        if (this.buffer.length > 0) this.scheduleEdit(true);
      } catch (err) {
        console.error(`[discord] rollover anchor send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private async flushNow(): Promise<void> {
    if (!this.anchor) return;
    const text = this.render();
    if (!text || text === this.lastSentText) return;
    this.lastEditAt = Date.now();
    try {
      await this.anchor.edit({ content: text });
      this.lastSentText = text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[discord] edit failed: ${message}; reopening anchor`);
      try {
        const sent = await this.sendable.send({ content: text });
        this.anchor = sent;
        this.lastSentText = text;
      } catch (err2) {
        console.error(`[discord] reopen anchor failed: ${err2 instanceof Error ? err2.message : String(err2)}`);
      }
    }
  }

  private handleSendFilesResult(output: unknown): void {
    const res = output as SendFilesResult | undefined;
    if (!res || res.status !== 'ok' || res.files.length === 0) return;

    const files = res.files;
    const priorAnchor = this.anchor;
    const priorLastSent = this.lastSentText;
    const pendingText = this.buffer.length > 0 ? this.render() : null;

    this.anchor = null;
    this.lastSentText = '';
    this.buffer = '';
    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    this.flushing = this.flushing.then(async () => {
      if (priorAnchor && pendingText !== null && pendingText !== priorLastSent) {
        try {
          await priorAnchor.edit({ content: pendingText });
        } catch (err) {
          console.error(`[discord] finalize edit failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      for (const file of files) {
        await this.sendAttachment(file);
      }
      try {
        const sent = await this.sendable.send({ content: '…' });
        this.anchor = sent;
        this.lastSentText = '…';
        this.lastEditAt = Date.now();
        if (this.buffer.length > 0) this.scheduleEdit(true);
      } catch (err) {
        console.error(`[discord] anchor reopen failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private async sendAttachment(file: SendFileEntry): Promise<void> {
    try {
      const attachment = new AttachmentBuilder(file.path, { name: path.basename(file.path) });
      await this.sendable.send({ files: [attachment] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[discord] send attachment (${file.path}) failed: ${message}`);
      try {
        await this.sendable.send({ content: `⚠️ ${path.basename(file.path)} failed to attach` });
      } catch {
        /* ignore */
      }
    }
  }

  private render(): string {
    const body = this.buffer.length > 0 ? this.buffer : '…';
    if (body.length <= DISCORD_MAX) return body;
    return body.slice(body.length - DISCORD_MAX);
  }
}
