import type { UIMessage } from 'ai';
import type { SubmoduleFastyclawServerStream } from '@/server/stream';

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

export interface Thread {
  id: string;
  messages: UIMessage[];
}

export interface Run {
  threadId: string;
  thread: Thread;
  config: AppConfig;
  abort: AbortController;
  stream: SubmoduleFastyclawServerStream;
  close: () => void;
}
