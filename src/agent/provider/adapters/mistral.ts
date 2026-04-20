import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const mistralAdapter: ProviderAdapter = {
  id: 'mistral',
  pkg: '@ai-sdk/mistral',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/mistral',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createMistral } = await import('@ai-sdk/mistral');
    const c = cfg as Extract<ProviderConfig, { id: 'mistral' }>;
    return createMistral({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
