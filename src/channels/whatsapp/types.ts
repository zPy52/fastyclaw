import type { WAMessage } from '@whiskeysockets/baileys';

export type WhatsappChatKind = 'private' | 'group';

export interface ChatMeta {
  title: string;
  kind: WhatsappChatKind;
}

export interface ChatMapEntry {
  threadId: string;
  title: string;
  kind: WhatsappChatKind;
}

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

export type WhatsappMessageHandler = (msgs: WAMessage[]) => Promise<void>;
