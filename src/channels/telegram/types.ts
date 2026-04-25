export type ChatKind = 'private' | 'group' | 'supergroup' | 'channel';

export interface ChatMeta {
  title: string;
  kind: ChatKind;
}

export interface ChatMapEntry {
  threadId: string;
  title: string;
  kind: ChatKind;
}

export interface TelegramChatListItem {
  chatId: number;
  threadId: string;
  title: string;
  kind: ChatKind;
}

export interface TelegramStatus {
  running: boolean;
  botUsername: string | null;
  lastError: string | null;
  chatCount: number;
}
