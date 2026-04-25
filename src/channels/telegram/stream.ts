import { InputFile, type Bot } from 'grammy';
import { SubmoduleFastyclawServerStream } from '@/server/stream';
import type { ServerEvent } from '@/server/types';
import type { SendFilesResult, SendFileEntry } from '@/agent/tools/send-files';

const EDIT_INTERVAL_MS = 800;
const TG_MAX = 4000;

export class TelegramStream extends SubmoduleFastyclawServerStream {
  private buffer = '';
  private messageId: number | null = null;
  private lastSentText = '';
  private scheduled: NodeJS.Timeout | null = null;
  private lastEditAt = 0;
  private flushing: Promise<void> = Promise.resolve();
  private closedLocal = false;
  private readonly toolNames = new Map<string, string>();

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
        // Tool calls remain in the persisted/UI message history, but we keep
        // Telegram output focused on the assistant's visible reply.
        this.toolNames.set(event.toolCallId, event.name);
        break;
      }
      case 'tool-result': {
        const name = this.toolNames.get(event.toolCallId);
        this.toolNames.delete(event.toolCallId);
        if (name === 'send_files') {
          this.handleSendFilesResult(event.output);
        }
        break;
      }
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

  private handleSendFilesResult(output: unknown): void {
    const res = output as SendFilesResult | undefined;
    if (!res || res.status !== 'ok' || res.files.length === 0) return;

    const files = res.files;
    const priorMessageId = this.messageId;
    const priorLastSent = this.lastSentText;
    const pendingText = this.buffer.length > 0 ? this.render() : null;

    // Detach the current anchor synchronously so incoming text-deltas accumulate
    // for the fresh anchor we'll create below the attachments.
    this.messageId = null;
    this.lastSentText = '';
    this.buffer = '';
    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    this.flushing = this.flushing.then(async () => {
      if (priorMessageId !== null && pendingText !== null && pendingText !== priorLastSent) {
        try {
          await this.bot.api.editMessageText(this.chatId, priorMessageId, pendingText);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes('message is not modified')) {
            console.error(`[telegram] editMessageText (finalize) failed: ${message}`);
          }
        }
      }
      for (const file of files) {
        await this.sendAttachment(file);
      }
      try {
        const sent = await this.bot.api.sendMessage(this.chatId, '…');
        this.messageId = sent.message_id;
        this.lastSentText = '…';
        this.lastEditAt = Date.now();
        if (this.buffer.length > 0) this.scheduleEdit(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[telegram] sendMessage (anchor) failed: ${message}`);
      }
    });
  }

  private async sendAttachment(file: SendFileEntry): Promise<void> {
    const input = new InputFile(file.path);
    try {
      switch (file.kind) {
        case 'photo':
          await this.bot.api.sendPhoto(this.chatId, input);
          return;
        case 'video':
          await this.bot.api.sendVideo(this.chatId, input);
          return;
        case 'audio':
          await this.bot.api.sendAudio(this.chatId, input);
          return;
        case 'voice':
          await this.bot.api.sendVoice(this.chatId, input);
          return;
        case 'document':
        default:
          await this.bot.api.sendDocument(this.chatId, input);
          return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] send ${file.kind} (${file.path}) failed: ${message}`);
    }
  }

  private render(): string {
    const body = this.buffer.length > 0 ? this.buffer : '…';
    const text = body;
    if (text.length <= TG_MAX) return text;
    return text.slice(text.length - TG_MAX);
  }
}
