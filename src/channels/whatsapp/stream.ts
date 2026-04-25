import path from 'node:path';
import type { WAMessageKey, WASocket } from '@whiskeysockets/baileys';
import { SubmoduleFastyclawServerStream } from '@/server/stream';
import type { ServerEvent } from '@/server/types';
import type { SendFilesResult, SendFileEntry } from '@/agent/tools/send-files';

const EDIT_INTERVAL_MS = 1200;
const WA_MAX = 4000;

export class WhatsappStream extends SubmoduleFastyclawServerStream {
  private buffer = '';
  private anchorKey: WAMessageKey | null = null;
  private lastSentText = '';
  private scheduled: NodeJS.Timeout | null = null;
  private lastEditAt = 0;
  private flushing: Promise<void> = Promise.resolve();
  private closedLocal = false;
  private readonly toolNames = new Map<string, string>();

  public constructor(
    private readonly sock: WASocket,
    private readonly jid: string,
    private readonly onSent?: (key: WAMessageKey) => void,
  ) {
    super();
  }

  public async init(): Promise<void> {
    const sent = await this.sock.sendMessage(this.jid, { text: '…' });
    this.rememberSent(sent?.key);
    this.anchorKey = sent?.key ?? null;
    this.lastSentText = '…';
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
    if (!this.anchorKey) return;
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
    if (!this.anchorKey) return;
    const text = this.render();
    if (!text || text === this.lastSentText) return;
    this.lastEditAt = Date.now();
    try {
      await this.sock.sendMessage(this.jid, { edit: this.anchorKey, text });
      this.lastSentText = text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp] edit failed: ${message}; reopening anchor`);
      try {
        const sent = await this.sock.sendMessage(this.jid, { text });
        this.rememberSent(sent?.key);
        this.anchorKey = sent?.key ?? null;
        this.lastSentText = text;
      } catch (err2) {
        console.error(`[whatsapp] reopen anchor failed: ${err2 instanceof Error ? err2.message : String(err2)}`);
      }
    }
  }

  private handleSendFilesResult(output: unknown): void {
    const res = output as SendFilesResult | undefined;
    if (!res || res.status !== 'ok' || res.files.length === 0) return;

    const files = res.files;
    const priorKey = this.anchorKey;
    const priorLastSent = this.lastSentText;
    const pendingText = this.buffer.length > 0 ? this.render() : null;

    this.anchorKey = null;
    this.lastSentText = '';
    this.buffer = '';
    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    this.flushing = this.flushing.then(async () => {
      if (priorKey && pendingText !== null && pendingText !== priorLastSent) {
        try {
          await this.sock.sendMessage(this.jid, { edit: priorKey, text: pendingText });
        } catch (err) {
          console.error(`[whatsapp] finalize edit failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      for (const file of files) {
        await this.sendAttachment(file);
      }
      try {
        const sent = await this.sock.sendMessage(this.jid, { text: '…' });
        this.rememberSent(sent?.key);
        this.anchorKey = sent?.key ?? null;
        this.lastSentText = '…';
        this.lastEditAt = Date.now();
        if (this.buffer.length > 0) this.scheduleEdit(true);
      } catch (err) {
        console.error(`[whatsapp] anchor reopen failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private async sendAttachment(file: SendFileEntry): Promise<void> {
    try {
      let sent: { key?: WAMessageKey } | undefined;
      switch (file.kind) {
        case 'photo':
          sent = await this.sock.sendMessage(this.jid, { image: { url: file.path } });
          break;
        case 'video':
          sent = await this.sock.sendMessage(this.jid, { video: { url: file.path } });
          break;
        case 'audio':
          sent = await this.sock.sendMessage(this.jid, { audio: { url: file.path }, mimetype: file.mediaType });
          break;
        case 'voice':
          sent = await this.sock.sendMessage(this.jid, {
            audio: { url: file.path },
            ptt: true,
            mimetype: 'audio/ogg; codecs=opus',
          });
          break;
        case 'document':
        default:
          sent = await this.sock.sendMessage(this.jid, {
            document: { url: file.path },
            fileName: path.basename(file.path),
            mimetype: file.mediaType,
          });
          break;
      }
      this.rememberSent(sent?.key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp] send ${file.kind} (${file.path}) failed: ${message}`);
    }
  }

  private rememberSent(key: WAMessageKey | null | undefined): void {
    if (key) this.onSent?.(key);
  }

  private render(): string {
    const body = this.buffer.length > 0 ? this.buffer : '…';
    if (body.length <= WA_MAX) return body;
    return body.slice(body.length - WA_MAX);
  }
}
