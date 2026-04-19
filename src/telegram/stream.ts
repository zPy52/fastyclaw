import type { Bot } from 'grammy';
import { SubmoduleFastyclawServerStream } from '@/server/stream';
import type { ServerEvent } from '@/server/types';

const EDIT_INTERVAL_MS = 800;
const TG_MAX = 4000;

export class TelegramStream extends SubmoduleFastyclawServerStream {
  private buffer = '';
  private toolLines: string[] = [];
  private messageId: number | null = null;
  private lastSentText = '';
  private scheduled: NodeJS.Timeout | null = null;
  private lastEditAt = 0;
  private flushing: Promise<void> = Promise.resolve();
  private closedLocal = false;

  public constructor(
    private readonly bot: Bot,
    private readonly chatId: number,
  ) {
    super();
  }

  public async init(): Promise<void> {
    const sent = await this.bot.api.sendMessage(this.chatId, '…');
    this.messageId = sent.message_id;
    this.lastSentText = '…';
  }

  public override write(event: ServerEvent): void {
    if (this.closedLocal) return;
    switch (event.type) {
      case 'text-delta':
        this.buffer += event.delta;
        this.scheduleEdit();
        break;
      case 'tool-call': {
        let inputPreview = '';
        try {
          inputPreview = JSON.stringify(event.input);
          if (inputPreview.length > 80) inputPreview = inputPreview.slice(0, 77) + '…';
        } catch {
          inputPreview = '…';
        }
        this.toolLines.push(`🔧 ${event.name}(${inputPreview})`);
        this.scheduleEdit();
        break;
      }
      case 'tool-result':
        // Keep the compact log; result bodies can be huge.
        break;
      case 'error':
        this.buffer += `\n⚠️ ${event.message}`;
        this.scheduleEdit();
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
    if (this.messageId === null) return;
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
    if (this.messageId === null) return;
    const text = this.render();
    if (!text || text === this.lastSentText) return;
    this.lastEditAt = Date.now();
    try {
      await this.bot.api.editMessageText(this.chatId, this.messageId, text);
      this.lastSentText = text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('message is not modified')) {
        console.error(`[telegram] editMessageText failed: ${message}`);
      }
    }
  }

  private render(): string {
    const body = this.buffer.length > 0 ? this.buffer : '…';
    const toolBlock = this.toolLines.length > 0 ? this.toolLines.join('\n') + '\n\n' : '';
    const text = toolBlock + body;
    if (text.length <= TG_MAX) return text;
    return text.slice(text.length - TG_MAX);
  }
}
