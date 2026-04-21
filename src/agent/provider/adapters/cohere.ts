import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const cohereAdapter: ProviderAdapter = {
  id: 'cohere',
  pkg: '@ai-sdk/cohere',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/cohere',
  async create(cfg, model): Promise<LanguageModel> {
    const { createCohere } = await import('@ai-sdk/cohere');
    const c = cfg as Extract<ProviderConfig, { id: 'cohere' }>;
    return createCohere({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
