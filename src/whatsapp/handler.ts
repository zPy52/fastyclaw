import type { WAMessage } from '@whiskeysockets/baileys';
import type { UIMessage } from 'ai';
import { AgentRuntime } from '@/agent/index';
import { FastyclawServer } from '@/server/index';
import type { AppConfig, Run, Thread, WhatsappConfig } from '@/server/types';
import { closeTerminal } from '@/agent/sessions/terminal';
import { closeBrowserSession } from '@/agent/sessions/browser';
import { WhatsappStream } from '@/whatsapp/stream';
import type { SubmoduleFastyclawWhatsappSock } from '@/whatsapp/sock';
import type { SubmoduleFastyclawWhatsappChats } from '@/whatsapp/chats';
import type { ChatMeta, WhatsappChatKind } from '@/whatsapp/types';

export class SubmoduleFastyclawWhatsappHandler {
  public constructor(
    private readonly sockModule: SubmoduleFastyclawWhatsappSock,
    private readonly chats: SubmoduleFastyclawWhatsappChats,
  ) {}

  public handle = async (msgs: WAMessage[]): Promise<void> => {
    const cfg = FastyclawServer.config.get().whatsapp;
    for (const m of msgs) {
      if (m.key.fromMe) continue;
      const jid = m.key.remoteJid;
      if (!jid || jid === 'status@broadcast') continue;
      const text = this.extractText(m);
      if (!text) continue;
      if (!this.isAllowed(jid, cfg)) continue;
      if (!this.shouldRespond(m, text, cfg)) continue;

      const kind = this.chatKind(jid);
      const meta: ChatMeta = { title: this.chatTitle(m, jid), kind };
      const threadId = await this.chats.resolve(jid, meta);
      const thread = await FastyclawServer.threads.load(threadId);
      if (!thread) continue;
      await this.runTurn(jid, thread, this.speakerPrefixed(m, text, kind));
    }
  };

  private chatKind(jid: string): WhatsappChatKind {
    return jid.endsWith('@g.us') ? 'group' : 'private';
  }

  private extractText(m: WAMessage): string {
    const msg = m.message;
    if (!msg) return '';
    const conv = (msg.conversation ?? '').trim();
    if (conv) return conv;
    const ext = msg.extendedTextMessage?.text ?? '';
    return ext.trim();
  }

  private isAllowed(jid: string, cfg: WhatsappConfig): boolean {
    if (cfg.allowedJids.length === 0) return true;
    return cfg.allowedJids.includes(jid);
  }

  private shouldRespond(m: WAMessage, text: string, cfg: WhatsappConfig): boolean {
    const kind = this.chatKind(m.key.remoteJid!);
    if (kind === 'private') return true;
    if (cfg.groupTrigger === 'all') return true;
    if (text.startsWith('/ask')) return true;
    const own = this.sockModule.ownJid();
    const ctx = m.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid ?? [];
    if (own && mentioned.includes(own)) return true;
    if (own && ctx?.participant === own) return true;
    return false;
  }

  private chatTitle(m: WAMessage, jid: string): string {
    if (this.chatKind(jid) === 'private') {
      return m.pushName || jid.split('@')[0];
    }
    return jid;
  }

  private speakerPrefixed(m: WAMessage, text: string, kind: WhatsappChatKind): string {
    let body = text;
    if (body.startsWith('/ask')) body = body.slice('/ask'.length).trim();
    if (!body) return '';
    if (kind === 'group') {
      const speaker = m.pushName || (m.key.participant ?? '').split('@')[0] || 'user';
      return `@${speaker}: ${body}`;
    }
    return body;
  }

  private async runTurn(jid: string, thread: Thread, userText: string): Promise<void> {
    const sock = this.sockModule.current();
    if (!sock || !userText) return;
    FastyclawServer.threads.activate(thread);
    const snapshotConfig: AppConfig = FastyclawServer.config.get();
    const stream = new WhatsappStream(sock, jid);
    try {
      await stream.init();
    } catch (err) {
      console.error(`[whatsapp] failed to send placeholder: ${err instanceof Error ? err.message : String(err)}`);
      FastyclawServer.threads.deactivate(thread.id);
      return;
    }
    const abort = new AbortController();
    const run: Run = {
      threadId: thread.id,
      thread,
      config: snapshotConfig,
      abort,
      stream,
      close: () => {
        try { abort.abort(); } catch { /* ignore */ }
        stream.end();
        closeTerminal(thread.id);
        void closeBrowserSession(thread.id);
      },
    };

    try {
      await AgentRuntime.loop.run(run, userText, async (messages: UIMessage[]) => {
        thread.messages = messages;
        await FastyclawServer.threads.save(thread);
      });
    } finally {
      run.close();
      await stream.drain();
      FastyclawServer.threads.deactivate(thread.id);
    }
  }
}
