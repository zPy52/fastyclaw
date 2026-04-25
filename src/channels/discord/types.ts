import type { Client, Message } from 'discord.js';

export type DiscordChatKind = 'dm' | 'guild' | 'thread';

export interface ChatMeta {
  title: string;
  kind: DiscordChatKind;
}

export interface ChatMapEntry {
  threadId: string;
  title: string;
  kind: DiscordChatKind;
}

export interface DiscordChatListItem {
  channelId: string;
  threadId: string;
  title: string;
  kind: DiscordChatKind;
}

export interface DiscordStatus {
  running: boolean;
  botUser: { id: string; tag: string } | null;
  chatCount: number;
}

export type DiscordMessageHandler = (m: Message, client: Client) => Promise<void>;
