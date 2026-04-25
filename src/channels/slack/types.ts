import type { WebClient } from '@slack/web-api';

export type SlackChannelKind = 'im' | 'mpim' | 'channel' | 'group';

export interface ChatMeta {
  title: string;
  kind: SlackChannelKind;
}

export interface ChatMapEntry {
  threadId: string;
  title: string;
  kind: SlackChannelKind;
}

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

export type SlackEventKind = 'message' | 'app_mention';

export interface SlackIncomingEvent {
  type?: string;
  subtype?: string;
  channel: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
}

export type SlackEventHandler = (
  kind: SlackEventKind,
  event: SlackIncomingEvent,
  client: WebClient,
) => Promise<void>;
