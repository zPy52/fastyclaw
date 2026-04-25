import fs from 'node:fs/promises';
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Const } from '@/config/index';
import type { WhatsappMessageHandler } from '@/channels/whatsapp/types';

interface BoomLike { output?: { statusCode?: number } }

export class SubmoduleFastyclawWhatsappSock {
  private sock: WASocket | null = null;
  private running = false;
  private qr: string | null = null;
  private paired = false;
  private starting: Promise<void> | null = null;
  private shouldReconnect = false;
  private currentHandler: WhatsappMessageHandler | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private lastError: string | null = null;

  public isRunning(): boolean {
    return this.running;
  }

  public current(): WASocket | null {
    return this.sock;
  }

  public ownJid(): string | null {
    const me = this.sock?.user?.id ?? null;
    if (!me) return null;
    // Baileys exposes "xxxx:yy@s.whatsapp.net" — normalize to bare "xxxx@s.whatsapp.net".
    const at = me.indexOf('@');
    if (at < 0) return me;
    const local = me.slice(0, at);
    const domain = me.slice(at);
    const bare = local.split(':')[0];
    return `${bare}${domain}`;
  }

  public latestQr(): string | null {
    return this.qr;
  }

  public isPaired(): boolean {
    return this.paired;
  }

  public error(): string | null {
    return this.lastError;
  }

  public async start(onMessage: WhatsappMessageHandler): Promise<void> {
    if (this.running || this.starting) return this.starting ?? undefined;
    this.currentHandler = onMessage;
    this.shouldReconnect = true;
    this.lastError = null;
    this.clearReconnectTimer();
    this.starting = this.connect();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async connect(): Promise<void> {
    this.clearReconnectTimer();
    await fs.mkdir(Const.whatsappAuthDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(Const.whatsappAuthDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[whatsapp] using Baileys version ${version.join('.')} (${isLatest ? 'latest' : 'bundled fallback'})`);
    const sock = makeWASocket({ auth: state, version, printQRInTerminal: false });
    this.sock = sock;
    this.running = true;
    this.paired = Boolean(state.creds.registered);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        this.qr = qr;
        try {
          qrcode.generate(qr, { small: true }, (ascii: string) => {
            console.log(`[whatsapp] scan this QR with WhatsApp → Linked Devices:\n${ascii}`);
          });
        } catch { /* ignore */ }
      }
      if (connection === 'open') {
        this.qr = null;
        this.paired = true;
        this.reconnectAttempts = 0;
        this.lastError = null;
        console.log(`[whatsapp] connected as ${this.ownJid() ?? 'unknown'}`);
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as BoomLike | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const message = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : 'connection closed';
        this.lastError = statusCode ? `${message} (${statusCode})` : message;
        this.running = false;
        this.sock = null;
        if (loggedOut) {
          this.paired = false;
          this.qr = null;
          console.log('[whatsapp] logged out; clearing auth');
          fs.rm(Const.whatsappAuthDir, { recursive: true, force: true }).catch(() => { /* ignore */ });
          return;
        }
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
      const handler = this.currentHandler;
      if (!handler) return;
      handler(messages).catch((err) => {
        console.error(`[whatsapp] handler error: ${err instanceof Error ? err.message : String(err)}`);
      });
    });
  }

  public async stop(): Promise<void> {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    const sock = this.sock;
    this.sock = null;
    this.running = false;
    this.currentHandler = null;
    if (sock) {
      try { sock.end(undefined); } catch { /* ignore */ }
    }
  }

  public async logout(): Promise<void> {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    const sock = this.sock;
    this.sock = null;
    this.running = false;
    this.paired = false;
    this.qr = null;
    this.currentHandler = null;
    if (sock) {
      try { await sock.logout(); } catch { /* ignore */ }
      try { sock.end(undefined); } catch { /* ignore */ }
    }
    await fs.rm(Const.whatsappAuthDir, { recursive: true, force: true }).catch(() => { /* ignore */ });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempts - 1, 5));
    console.log(`[whatsapp] connection closed; reconnecting in ${Math.round(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect || this.running || this.starting) return;
      this.starting = this.connect();
      this.starting.catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = message;
        console.error(`[whatsapp] reconnect failed: ${message}`);
        if (this.shouldReconnect) this.scheduleReconnect();
      }).finally(() => {
        this.starting = null;
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
