import type {
  SlackChannelTrigger,
  SlackChatListItem,
  SlackConfig,
  SlackStatus,
} from './types.js';

export class FastyclawClientSlack {
  public constructor(
    private readonly baseUrl: string,
    private readonly authHeaders: Record<string, string> = {},
  ) {}

  public async getConfig(): Promise<SlackConfig> {
    const res = await fetch(`${this.baseUrl}/slack/config`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
    return (await res.json()) as SlackConfig;
  }

  public async setBotToken(token: string): Promise<void> {
    await this.patch({ botToken: token });
  }

  public async setAppToken(token: string): Promise<void> {
    await this.patch({ appToken: token });
  }

  public async setAllowedUsers(ids: string[]): Promise<void> {
    await this.patch({ allowedUserIds: ids });
  }

  public async setChannelTrigger(mode: SlackChannelTrigger): Promise<void> {
    await this.patch({ channelTrigger: mode });
  }

  public async enable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/slack/start`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`enable failed: ${res.status}`);
  }

  public async disable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/slack/stop`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`disable failed: ${res.status}`);
  }

  public async status(): Promise<SlackStatus> {
    const res = await fetch(`${this.baseUrl}/slack/status`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`status failed: ${res.status}`);
    return (await res.json()) as SlackStatus;
  }

  public async listChats(): Promise<SlackChatListItem[]> {
    const res = await fetch(`${this.baseUrl}/slack/chats`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`listChats failed: ${res.status}`);
    return (await res.json()) as SlackChatListItem[];
  }

  public async forgetChat(channelId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/slack/chats/${encodeURIComponent(channelId)}`,
      { method: 'DELETE', headers: this.authHeaders },
    );
    if (!res.ok) throw new Error(`forgetChat failed: ${res.status}`);
  }

  private async patch(body: Partial<SlackConfig>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/slack/config`, {
      method: 'POST',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`slack config update failed: ${res.status}`);
  }
}
