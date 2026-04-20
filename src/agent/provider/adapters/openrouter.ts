import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const openrouterAdapter: ProviderAdapter = {
  id: 'openrouter',
  pkg: '@openrouter/ai-sdk-provider',
  docsUrl: 'https://openrouter.ai/docs/community/vercel-ai-sdk',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const mod = await import('@openrouter/ai-sdk-provider');
    const c = cfg as Extract<ProviderConfig, { id: 'openrouter' }>;
    const factory = mod.createOpenRouter
      ? mod.createOpenRouter({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })
      : mod.openrouter;
    const chat = factory.chat ?? factory;
    return chat(model);
  },
};
