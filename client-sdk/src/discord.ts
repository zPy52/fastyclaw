import type {
  DiscordChatListItem,
  DiscordConfig,
  DiscordGroupTrigger,
  DiscordStatus,
} from './types.js';

export class FastyclawClientDiscord {
  public constructor(
    private readonly baseUrl: string,
    private readonly authHeaders: Record<string, string> = {},
  ) {}

  public async getConfig(): Promise<DiscordConfig> {
    const res = await fetch(`${this.baseUrl}/discord/config`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
    return (await res.json()) as DiscordConfig;
  }

  public async setToken(token: string): Promise<void> {
    await this.patch({ token });
  }

  public async setAllowedUsers(ids: string[]): Promise<void> {
    await this.patch({ allowedUserIds: ids });
  }

  public async setGroupTrigger(mode: DiscordGroupTrigger): Promise<void> {
    await this.patch({ groupTrigger: mode });
  }

  public async enable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/discord/start`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`enable failed: ${res.status}`);
  }

  public async disable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/discord/stop`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`disable failed: ${res.status}`);
  }

  public async status(): Promise<DiscordStatus> {
    const res = await fetch(`${this.baseUrl}/discord/status`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`status failed: ${res.status}`);
    return (await res.json()) as DiscordStatus;
  }

  public async listChats(): Promise<DiscordChatListItem[]> {
    const res = await fetch(`${this.baseUrl}/discord/chats`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`listChats failed: ${res.status}`);
    return (await res.json()) as DiscordChatListItem[];
  }

  public async forgetChat(channelId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/discord/chats/${encodeURIComponent(channelId)}`,
      { method: 'DELETE', headers: this.authHeaders },
    );
    if (!res.ok) throw new Error(`forgetChat failed: ${res.status}`);
  }

  private async patch(body: Partial<DiscordConfig>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/discord/config`, {
      method: 'POST',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`discord config update failed: ${res.status}`);
  }
}
