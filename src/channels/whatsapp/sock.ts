import fs from 'node:fs/promises';
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  proto,
  useMultiFileAuthState,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Const } from '@/config/index';
import type { WhatsappMessageHandler } from '@/channels/whatsapp/types';

interface BoomLike { output?: { statusCode?: number } }

export function recentWhatsappHistoryMessages(
  messages: WAMessage[],
  cutoffMs: number,
  ownJids: readonly string[] = [],
): WAMessage[] {
  const cutoffSeconds = Math.floor(cutoffMs / 1000);
  const own = new Set(ownJids.map(normalizeJid).filter(Boolean));
  return messages.filter((message) => {
    if (messageTimestampSeconds(message.messageTimestamp) < cutoffSeconds) return false;
    if (own.size === 0) return true;
    const jid = normalizeJid(message.key.remoteJid);
    return Boolean(message.key.fromMe && jid && own.has(jid));
  });
}

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
  private ownLid: string | null = null;
  private readonly outboundMessageIds = new Set<string>();
  private readonly outboundMessageOrder: string[] = [];
  private readonly seenMessageIds = new Set<string>();
  private readonly seenMessageOrder: string[] = [];

  public isRunning(): boolean {
    return this.running;
  }

  public current(): WASocket | null {
    return this.sock;
  }

  public ownJid(): string | null {
    const me = this.sock?.user?.id ?? null;
    if (!me) return null;
    return normalizeJid(me);
  }

  public isOwnJid(jid: string): boolean {
    return this.ownJidCandidates().has(normalizeJid(jid));
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

  public rememberOutboundMessage(key: WAMessageKey | null | undefined): void {
    const id = this.messageKeyId(key);
    if (!id || this.outboundMessageIds.has(id)) return;
    this.outboundMessageIds.add(id);
    this.outboundMessageOrder.push(id);
    while (this.outboundMessageOrder.length > 200) {
      const old = this.outboundMessageOrder.shift();
      if (old) this.outboundMessageIds.delete(old);
    }
  }

  public isRememberedOutboundMessage(key: WAMessageKey | null | undefined): boolean {
    const id = this.messageKeyId(key);
    return id ? this.outboundMessageIds.has(id) : false;
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
    this.ownLid = state.creds.me?.lid ? normalizeJid(state.creds.me.lid) : null;
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[whatsapp] using Baileys version ${version.join('.')} (${isLatest ? 'latest' : 'bundled fallback'})`);
    const historyCutoffMs = Date.now() - 5_000;
    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      maxMsgRetryCount: 0,
      shouldSyncHistoryMessage: (msg) => msg.syncType === proto.HistorySync.HistorySyncType.RECENT,
    });
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
      this.dispatchMessages(messages);
    });

    sock.ev.on('messaging-history.set', ({ messages, syncType }) => {
      if (syncType !== proto.HistorySync.HistorySyncType.RECENT) return;
      this.dispatchMessages(recentWhatsappHistoryMessages(messages, historyCutoffMs, [...this.ownJidCandidates()]));
    });
  }

  public async stop(): Promise<void> {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    const sock = this.sock;
    this.sock = null;
    this.running = false;
    this.currentHandler = null;
    this.ownLid = null;
    this.seenMessageIds.clear();
    this.seenMessageOrder.length = 0;
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
    this.ownLid = null;
    this.outboundMessageIds.clear();
    this.outboundMessageOrder.length = 0;
    this.seenMessageIds.clear();
    this.seenMessageOrder.length = 0;
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

  private dispatchMessages(messages: WAMessage[]): void {
    if (messages.length === 0) return;
    const handler = this.currentHandler;
    if (!handler) return;
    const fresh = messages.filter((message) => this.rememberSeenMessage(message.key));
    if (fresh.length === 0) return;
    handler(fresh).catch((err) => {
      console.error(`[whatsapp] handler error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private rememberSeenMessage(key: WAMessageKey | null | undefined): boolean {
    const id = this.messageKeyId(key);
    if (!id) return true;
    if (this.seenMessageIds.has(id)) return false;
    this.seenMessageIds.add(id);
    this.seenMessageOrder.push(id);
    while (this.seenMessageOrder.length > 500) {
      const old = this.seenMessageOrder.shift();
      if (old) this.seenMessageIds.delete(old);
    }
    return true;
  }

  private messageKeyId(key: WAMessageKey | null | undefined): string | null {
    if (!key?.id || !key.remoteJid) return null;
    return `${key.remoteJid}:${key.id}`;
  }

  private ownJidCandidates(): Set<string> {
    const candidates = [
      this.sock?.user?.id,
      this.ownLid,
      this.ownJid(),
    ];
    return new Set(candidates.map(normalizeJid).filter(Boolean));
  }
}

function messageTimestampSeconds(value: WAMessage['messageTimestamp']): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value) || 0;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return 0;
}

function normalizeJid(jid: string | null | undefined): string {
  if (!jid) return '';
  const at = jid.indexOf('@');
  if (at < 0) return jid;
  const local = jid.slice(0, at);
  const domain = jid.slice(at);
  return `${local.split(':')[0]}${domain}`;
}
