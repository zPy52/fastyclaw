export type ServerEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; name: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; output: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type ProviderId =
  | 'openai' | 'anthropic' | 'google' | 'google-vertex' | 'azure'
  | 'amazon-bedrock' | 'groq' | 'mistral' | 'xai' | 'deepseek'
  | 'perplexity' | 'cohere' | 'togetherai' | 'fireworks' | 'cerebras'
  | 'openai-compatible' | 'gateway'
  | 'claude-code' | 'codex-cli' | 'gemini-cli' | 'ollama' | 'openrouter';

/** Legacy alias — prefer `ProviderId`. */
export type Provider = ProviderId;

export interface ProviderSettingsBase {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

export type ProviderConfig =
  | ({ id: 'openai' } & ProviderSettingsBase & { organization?: string; project?: string })
  | ({ id: 'anthropic' } & ProviderSettingsBase)
  | ({ id: 'google' } & ProviderSettingsBase)
  | ({ id: 'google-vertex' } & ProviderSettingsBase & { project: string; location: string })
  | ({ id: 'azure' } & ProviderSettingsBase & { resourceName: string; apiVersion?: string })
  | ({ id: 'amazon-bedrock' } & { region: string; accessKeyId?: string; secretAccessKey?: string; sessionToken?: string })
  | ({ id: 'groq' } & ProviderSettingsBase)
  | ({ id: 'mistral' } & ProviderSettingsBase)
  | ({ id: 'xai' } & ProviderSettingsBase)
  | ({ id: 'deepseek' } & ProviderSettingsBase)
  | ({ id: 'perplexity' } & ProviderSettingsBase)
  | ({ id: 'cohere' } & ProviderSettingsBase)
  | ({ id: 'togetherai' } & ProviderSettingsBase)
  | ({ id: 'fireworks' } & ProviderSettingsBase)
  | ({ id: 'cerebras' } & ProviderSettingsBase)
  | ({ id: 'openai-compatible' } & ProviderSettingsBase & { name: string })
  | ({ id: 'gateway' } & ProviderSettingsBase)
  | ({ id: 'claude-code' } & { binPath?: string })
  | ({ id: 'codex-cli' } & { binPath?: string })
  | ({ id: 'gemini-cli' } & { binPath?: string })
  | ({ id: 'ollama' } & ProviderSettingsBase)
  | ({ id: 'openrouter' } & ProviderSettingsBase);

export interface CallOptions {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
}

export interface ProviderInfo {
  id: ProviderId;
  pkg: string | null;
  installed: boolean;
  docsUrl: string;
  active: boolean;
}

export type TelegramGroupTrigger = 'mention' | 'all';

export interface TelegramConfig {
  token: string | null;
  enabled: boolean;
  allowedUserIds: number[];
  groupTrigger: TelegramGroupTrigger;
}

export type WhatsappGroupTrigger = 'mention' | 'all';

export interface WhatsappConfig {
  enabled: boolean;
  allowedJids: string[];
  groupTrigger: WhatsappGroupTrigger;
}

export type WhatsappChatKind = 'private' | 'group';

export interface WhatsappChatListItem {
  jid: string;
  threadId: string;
  title: string;
  kind: WhatsappChatKind;
}

export interface WhatsappStatus {
  running: boolean;
  paired: boolean;
  ownJid: string | null;
  chatCount: number;
}

export type SlackChannelTrigger = 'mention' | 'all';

export interface SlackConfig {
  botToken: string | null;
  appToken: string | null;
  enabled: boolean;
  allowedUserIds: string[];
  channelTrigger: SlackChannelTrigger;
}

export type SlackChannelKind = 'im' | 'mpim' | 'channel' | 'group';

export interface SlackChatListItem {
  channelId: string;
  threadId: string;
  title: string;
  kind: SlackChannelKind;
}

export interface SlackStatus {
  running: boolean;
  botUserId: string | null;
  chatCount: number;
}

export type DiscordGroupTrigger = 'mention' | 'all';

export interface DiscordConfig {
  token: string | null;
  enabled: boolean;
  allowedUserIds: string[];
  groupTrigger: DiscordGroupTrigger;
}

export type DiscordChatKind = 'dm' | 'guild' | 'thread';

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

export interface AppConfig {
  authToken: string | null;
  model: string;
  provider: ProviderConfig;
  providerOptions: Record<string, Record<string, unknown>>;
  callOptions: CallOptions;
  cwd: string;
  telegram: TelegramConfig;
  whatsapp: WhatsappConfig;
  slack: SlackConfig;
  discord: DiscordConfig;
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
  authToken?: string;
}
