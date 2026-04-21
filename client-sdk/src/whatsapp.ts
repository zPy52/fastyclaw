import type {
  WhatsappChatListItem,
  WhatsappConfig,
  WhatsappGroupTrigger,
  WhatsappStatus,
} from '@/types';

export class FastyclawClientWhatsapp {
  public constructor(private readonly baseUrl: string) {}

  public async getConfig(): Promise<WhatsappConfig> {
    const res = await fetch(`${this.baseUrl}/whatsapp/config`);
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
    const res = await fetch(`${this.baseUrl}/whatsapp/start`, { method: 'POST' });
    if (!res.ok) throw new Error(`enable failed: ${res.status}`);
  }

  public async disable(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/stop`, { method: 'POST' });
    if (!res.ok) throw new Error(`disable failed: ${res.status}`);
  }

  public async status(): Promise<WhatsappStatus> {
    const res = await fetch(`${this.baseUrl}/whatsapp/status`);
    if (!res.ok) throw new Error(`status failed: ${res.status}`);
    return (await res.json()) as WhatsappStatus;
  }

  public async qr(): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/whatsapp/qr`);
    if (!res.ok) throw new Error(`qr failed: ${res.status}`);
    const body = (await res.json()) as { qr: string | null };
    return body.qr;
  }

  public async logout(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/logout`, { method: 'POST' });
    if (!res.ok) throw new Error(`logout failed: ${res.status}`);
  }

  public async listChats(): Promise<WhatsappChatListItem[]> {
    const res = await fetch(`${this.baseUrl}/whatsapp/chats`);
    if (!res.ok) throw new Error(`listChats failed: ${res.status}`);
    return (await res.json()) as WhatsappChatListItem[];
  }

  public async forgetChat(jid: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/chats/${encodeURIComponent(jid)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`forgetChat failed: ${res.status}`);
  }

  private async patch(body: Partial<WhatsappConfig>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/whatsapp/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`whatsapp config update failed: ${res.status}`);
  }
}
