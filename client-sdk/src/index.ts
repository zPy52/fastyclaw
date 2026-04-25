export { FastyclawClient } from './client.js';
export { FastyclawClientTelegram } from './telegram.js';
export { FastyclawClientWhatsapp } from './whatsapp.js';
export { FastyclawClientSlack } from './slack.js';
export { FastyclawClientDiscord } from './discord.js';
export { FastyclawClientProviders } from './providers.js';
export { FastyclawClientAutomations } from './automations.js';
export type {
  ServerEvent,
  Provider,
  ProviderId,
  ProviderConfig,
  ProviderSettingsBase,
  ProviderInfo,
  CallOptions,
  AppConfig,
  FastyclawClientOptions,
  TelegramConfig,
  TelegramGroupTrigger,
  TelegramStatus,
  TelegramChatListItem,
  ChatKind,
  WhatsappConfig,
  WhatsappGroupTrigger,
  WhatsappStatus,
  WhatsappChatListItem,
  WhatsappChatKind,
  SlackConfig,
  SlackChannelTrigger,
  SlackStatus,
  SlackChatListItem,
  SlackChannelKind,
  DiscordConfig,
  DiscordGroupTrigger,
  DiscordStatus,
  DiscordChatListItem,
  DiscordChatKind,
  Automation,
  AutomationTrigger,
  AutomationMode,
  AutomationRun,
  AutomationRunStatus,
  CreateAutomationInput,
} from './types.js';
