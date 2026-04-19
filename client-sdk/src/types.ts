export type ServerEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; name: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; output: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type Provider = 'openai';

export interface AppConfig {
  model: string;
  provider: Provider;
  cwd: string;
}

export interface FastyclawClientOptions {
  baseUrl?: string;
}
