export type ServerEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; name: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; output: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type Provider = 'openai';

export type TelegramGroupTrigger = 'mention' | 'all';

export interface TelegramConfig {
  token: string | null;
  enabled: boolean;
  allowedUserIds: number[];
  groupTrigger: TelegramGroupTrigger;
}

export interface AppConfig {
  model: string;
  provider: Provider;
  cwd: string;
  telegram: TelegramConfig;
}

export type ChatKind = 'private' | 'group' | 'supergroup' | 'channel';

export interface TelegramChatListItem {
  chatId: number;
  threadId: string;
  title: string;
  kind: ChatKind;
}

export interface TelegramStatus {
  running: boolean;
  botUsername: string | null;
  chatCount: number;
}

export interface FastyclawClientOptions {
  baseUrl?: string;
}
