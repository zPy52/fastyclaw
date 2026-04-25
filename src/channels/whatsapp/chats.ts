import fs from 'node:fs/promises';
import { Const } from '@/config/index';
import { FastyclawServer } from '@/server/index';
import type { ChatMapEntry, ChatMeta, WhatsappChatListItem } from '@/channels/whatsapp/types';

type ChatMap = Record<string, ChatMapEntry>;

export class SubmoduleFastyclawWhatsappChats {
  private map: ChatMap = {};
  private loaded = false;

  public async load(): Promise<void> {
    try {
      const raw = await fs.readFile(Const.whatsappChatsPath, 'utf8');
      const parsed = JSON.parse(raw) as ChatMap;
      this.map = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.map = {};
    }
    this.loaded = true;
  }

  public async resolve(jid: string, meta: ChatMeta): Promise<string> {
    if (!this.loaded) await this.load();
    const existing = this.map[jid];
    if (existing && await FastyclawServer.threads.load(existing.threadId)) {
      if (existing.title !== meta.title || existing.kind !== meta.kind) {
        this.map[jid] = { ...existing, title: meta.title, kind: meta.kind };
        await this.persist();
      }
      return existing.threadId;
    }
    const thread = await FastyclawServer.threads.create();
    this.map[jid] = { threadId: thread.id, title: meta.title, kind: meta.kind };
    await this.persist();
    return thread.id;
  }

  public async forget(jid: string): Promise<void> {
    if (!this.loaded) await this.load();
    if (!(jid in this.map)) return;
    delete this.map[jid];
    await this.persist();
  }

  public list(): WhatsappChatListItem[] {
    return Object.entries(this.map).map(([jid, entry]) => ({
      jid,
      threadId: entry.threadId,
      title: entry.title,
      kind: entry.kind,
    }));
  }

  public count(): number {
    return Object.keys(this.map).length;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(Const.fastyclawDir, { recursive: true });
    await fs.writeFile(Const.whatsappChatsPath, JSON.stringify(this.map), 'utf8');
  }
}
