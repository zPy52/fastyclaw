import type { ModelMessage } from 'ai';
import type { SubmoduleFastyclawServerStream } from '@/server/stream';

export type ServerEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; name: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; output: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type Provider = 'openai';

export interface SessionConfig {
  model: string;
  provider: Provider;
  cwd: string;
}

export interface Session {
  id: string;
  config: SessionConfig;
  messages: ModelMessage[];
  abort: AbortController;
  stream: SubmoduleFastyclawServerStream;
  close: () => void;
}
