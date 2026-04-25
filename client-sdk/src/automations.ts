import type { Automation, AutomationRun, CreateAutomationInput } from './types.js';

export class FastyclawClientAutomations {
  public constructor(
    private readonly baseUrl: string,
    private readonly authHeaders: Record<string, string> = {},
  ) {}

  public async list(): Promise<Automation[]> {
    const res = await fetch(`${this.baseUrl}/automations`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`automations.list failed: ${res.status}`);
    return (await res.json()) as Automation[];
  }

  public async get(id: string): Promise<{ automation: Automation; runs: AutomationRun[] }> {
    const res = await fetch(`${this.baseUrl}/automations/${encodeURIComponent(id)}`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`automations.get failed: ${res.status}`);
    return (await res.json()) as { automation: Automation; runs: AutomationRun[] };
  }

  public async create(input: CreateAutomationInput): Promise<Automation> {
    const res = await fetch(`${this.baseUrl}/automations`, {
      method: 'POST',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`automations.create failed: ${res.status}`);
    return (await res.json()) as Automation;
  }

  public async patch(id: string, patch: Partial<Automation>): Promise<Automation> {
    const res = await fetch(`${this.baseUrl}/automations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`automations.patch failed: ${res.status}`);
    return (await res.json()) as Automation;
  }

  public async delete(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/automations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.authHeaders,
    });
    if (!res.ok) throw new Error(`automations.delete failed: ${res.status}`);
  }

  public async runNow(id: string): Promise<{ runId: string; threadId: string }> {
    const res = await fetch(`${this.baseUrl}/automations/${encodeURIComponent(id)}/run`, {
      method: 'POST',
      headers: this.authHeaders,
    });
    if (!res.ok) throw new Error(`automations.runNow failed: ${res.status}`);
    return (await res.json()) as { runId: string; threadId: string };
  }
}
