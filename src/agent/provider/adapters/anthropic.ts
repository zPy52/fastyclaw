import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  pkg: '@ai-sdk/anthropic',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/anthropic',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const c = cfg as Extract<ProviderConfig, { id: 'anthropic' }>;
    return createAnthropic({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
  async listModels(cfg): Promise<string[]> {
    const c = cfg as Extract<ProviderConfig, { id: 'anthropic' }>;
    const base = c.baseURL ?? 'https://api.anthropic.com/v1';
    const key = c.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    if (!key) return [];
    const res = await fetch(`${base}/models`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    return (json.data ?? []).map((m) => m.id).sort();
  },
};
