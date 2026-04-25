import fs from 'node:fs/promises';
import { Const } from '@/config/index';
import { FastyclawServer } from '@/server/index';
import type { ChatMapEntry, ChatMeta, TelegramChatListItem } from '@/channels/telegram/types';

type ChatMap = Record<string, ChatMapEntry>;

export class SubmoduleFastyclawTelegramChats {
  private map: ChatMap = {};
  private loaded = false;

  public async load(): Promise<void> {
    try {
      const raw = await fs.readFile(Const.telegramChatsPath, 'utf8');
      const parsed = JSON.parse(raw) as ChatMap;
      this.map = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.map = {};
    }
    this.loaded = true;
  }

  public async resolve(chatId: number, meta: ChatMeta): Promise<string> {
    if (!this.loaded) await this.load();
    const key = String(chatId);
    const existing = this.map[key];
    if (existing && await FastyclawServer.threads.load(existing.threadId)) {
      if (existing.title !== meta.title || existing.kind !== meta.kind) {
        this.map[key] = { ...existing, title: meta.title, kind: meta.kind };
        await this.persist();
      }
      return existing.threadId;
    }
    const thread = await FastyclawServer.threads.create();
    this.map[key] = { threadId: thread.id, title: meta.title, kind: meta.kind };
    await this.persist();
    return thread.id;
  }

  public async forget(chatId: number): Promise<void> {
    if (!this.loaded) await this.load();
    const key = String(chatId);
    if (!(key in this.map)) return;
    delete this.map[key];
    await this.persist();
  }

  public list(): TelegramChatListItem[] {
    return Object.entries(this.map).map(([chatId, entry]) => ({
      chatId: Number(chatId),
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
    await fs.writeFile(Const.telegramChatsPath, JSON.stringify(this.map), 'utf8');
  }
}
