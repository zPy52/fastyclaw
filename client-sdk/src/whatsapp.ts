import type {
  WhatsappChatListItem,
  WhatsappConfig,
  WhatsappGroupTrigger,
  WhatsappStatus,
} from './types.js';

export class FastyclawClientWhatsapp {
  public constructor(
    private readonly baseUrl: string,
    private readonly authHeaders: Record<string, string> = {},
  ) {}

  public async getConfig(): Promise<WhatsappConfig> {
    const res = await fetch(`${this.baseUrl}/whatsapp/config`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
    return (await res.json()) as WhatsappConfig;
  }

  public async setAllowedJids(jids: string[]): Promise<void> {
    await this.patch({ allowedJids: jids });
  }

  public async setGroupTrigger(mode: WhatsappGroupTrigger): Promise<void> {
    await this.patch({ groupTrigger: mode });
  }

  public async enable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/start`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`enable failed: ${res.status}`);
  }

  public async disable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/stop`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`disable failed: ${res.status}`);
  }

  public async status(): Promise<WhatsappStatus> {
    const res = await fetch(`${this.baseUrl}/whatsapp/status`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`status failed: ${res.status}`);
    return (await res.json()) as WhatsappStatus;
  }

  public async qr(): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/whatsapp/qr`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`qr failed: ${res.status}`);
    const body = (await res.json()) as { qr: string | null };
    return body.qr;
  }

  public async logout(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/logout`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`logout failed: ${res.status}`);
  }

  public async listChats(): Promise<WhatsappChatListItem[]> {
    const res = await fetch(`${this.baseUrl}/whatsapp/chats`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`listChats failed: ${res.status}`);
    return (await res.json()) as WhatsappChatListItem[];
  }

  public async forgetChat(jid: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/chats/${encodeURIComponent(jid)}`, {
      method: 'DELETE',
      headers: this.authHeaders,
    });
    if (!res.ok) throw new Error(`forgetChat failed: ${res.status}`);
  }

  private async patch(body: Partial<WhatsappConfig>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/config`, {
      method: 'POST',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`whatsapp config update failed: ${res.status}`);
  }
}
