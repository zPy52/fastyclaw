import type {
  TelegramChatListItem,
  TelegramConfig,
  TelegramGroupTrigger,
  TelegramStatus,
} from '@/types';

export class FastyclawClientTelegram {
  public constructor(private readonly baseUrl: string) {}

  public async getConfig(): Promise<TelegramConfig> {
    const res = await fetch(`${this.baseUrl}/telegram/config`);
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
    return (await res.json()) as TelegramConfig;
  }

  public async setToken(token: string): Promise<void> {
    await this.patch({ token });
  }

  public async setAllowedUsers(ids: number[]): Promise<void> {
    await this.patch({ allowedUserIds: ids });
  }

  public async setGroupTrigger(mode: TelegramGroupTrigger): Promise<void> {
    await this.patch({ groupTrigger: mode });
  }

  public async enable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/telegram/start`, { method: 'POST' });
    if (!res.ok) throw new Error(`enable failed: ${res.status}`);
  }

  public async disable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/telegram/stop`, { method: 'POST' });
    if (!res.ok) throw new Error(`disable failed: ${res.status}`);
  }

  public async status(): Promise<TelegramStatus> {
    const res = await fetch(`${this.baseUrl}/telegram/status`);
    if (!res.ok) throw new Error(`status failed: ${res.status}`);
    return (await res.json()) as TelegramStatus;
  }

  public async listChats(): Promise<TelegramChatListItem[]> {
    const res = await fetch(`${this.baseUrl}/telegram/chats`);
    if (!res.ok) throw new Error(`listChats failed: ${res.status}`);
    return (await res.json()) as TelegramChatListItem[];
  }

  public async forgetChat(chatId: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/telegram/chats/${chatId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`forgetChat failed: ${res.status}`);
  }

  private async patch(body: Partial<TelegramConfig>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/telegram/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`telegram config update failed: ${res.status}`);
  }
}
