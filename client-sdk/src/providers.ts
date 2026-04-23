import type { ProviderId, ProviderInfo } from './types.js';

export class FastyclawClientProviders {
  public constructor(
    private readonly baseUrl: string,
    private readonly authHeaders: Record<string, string> = {},
  ) {}

  public async list(): Promise<ProviderInfo[]> {
    const res = await fetch(`${this.baseUrl}/providers`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`providers.list failed: ${res.status}`);
    return (await res.json()) as ProviderInfo[];
  }

  public async models(id: ProviderId): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/providers/${encodeURIComponent(id)}/models`, {
      headers: this.authHeaders,
    });
    if (!res.ok) throw new Error(`providers.models failed: ${res.status}`);
    const body = (await res.json()) as { models: string[] };
    return body.models ?? [];
  }

  public async probe(
    id: ProviderId,
    settings: Record<string, unknown>,
    model: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${this.baseUrl}/providers/${encodeURIComponent(id)}/probe`, {
      method: 'POST',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, model }),
    });
    if (!res.ok) throw new Error(`providers.probe failed: ${res.status}`);
    return (await res.json()) as { ok: boolean; error?: string };
  }
}
