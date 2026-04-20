import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const xaiAdapter: ProviderAdapter = {
  id: 'xai',
  pkg: '@ai-sdk/xai',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/xai',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createXai } = await import('@ai-sdk/xai');
    const c = cfg as Extract<ProviderConfig, { id: 'xai' }>;
    return createXai({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
