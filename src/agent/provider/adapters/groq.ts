import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const groqAdapter: ProviderAdapter = {
  id: 'groq',
  pkg: '@ai-sdk/groq',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/groq',
  async create(cfg, model): Promise<LanguageModel> {
    const { createGroq } = await import('@ai-sdk/groq');
    const c = cfg as Extract<ProviderConfig, { id: 'groq' }>;
    return createGroq({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
  async listModels(cfg): Promise<string[]> {
    const c = cfg as Extract<ProviderConfig, { id: 'groq' }>;
    const base = c.baseURL ?? 'https://api.groq.com/openai/v1';
    const key = c.apiKey ?? process.env.GROQ_API_KEY ?? '';
    if (!key) return [];
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    return (json.data ?? []).map((m) => m.id).sort();
  },
};
