import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  pkg: '@ai-sdk/openai',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/openai',
  async create(cfg, model): Promise<LanguageModel> {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const c = cfg as Extract<ProviderConfig, { id: 'openai' }>;
    return createOpenAI({
      apiKey: c.apiKey,
      baseURL: c.baseURL,
      headers: c.headers,
      organization: c.organization,
      project: c.project,
    })(model);
  },
  async listModels(cfg): Promise<string[]> {
    const c = cfg as Extract<ProviderConfig, { id: 'openai' }>;
    const base = c.baseURL ?? 'https://api.openai.com/v1';
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${c.apiKey ?? process.env.OPENAI_API_KEY ?? ''}` },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    return (json.data ?? []).map((m) => m.id).sort();
  },
};
