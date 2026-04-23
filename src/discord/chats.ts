import fs from 'node:fs/promises';
import { Const } from '@/config/index';
import { FastyclawServer } from '@/server/index';
import type { ChatMapEntry, ChatMeta, DiscordChatListItem } from '@/discord/types';

type ChatMap = Record<string, ChatMapEntry>;

export class SubmoduleFastyclawDiscordChats {
  private map: ChatMap = {};
  private loaded = false;

  public async load(): Promise<void> {
    try {
      const raw = await fs.readFile(Const.discordChatsPath, 'utf8');
      const parsed = JSON.parse(raw) as ChatMap;
      this.map = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.map = {};
    }
    this.loaded = true;
  }

  public async resolve(channelId: string, meta: ChatMeta): Promise<string> {
    if (!this.loaded) await this.load();
    const existing = this.map[channelId];
    if (existing) {
      if (existing.title !== meta.title || existing.kind !== meta.kind) {
        this.map[channelId] = { ...existing, title: meta.title, kind: meta.kind };
        await this.persist();
      }
      return existing.threadId;
    }
    const thread = await FastyclawServer.threads.create();
    this.map[channelId] = { threadId: thread.id, title: meta.title, kind: meta.kind };
    await this.persist();
    return thread.id;
  }

  public async forget(channelId: string): Promise<void> {
    if (!this.loaded) await this.load();
    if (!(channelId in this.map)) return;
    delete this.map[channelId];
    await this.persist();
  }

  public list(): DiscordChatListItem[] {
    return Object.entries(this.map).map(([channelId, entry]) => ({
      channelId,
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
    await fs.writeFile(Const.discordChatsPath, JSON.stringify(this.map), 'utf8');
  }
}
