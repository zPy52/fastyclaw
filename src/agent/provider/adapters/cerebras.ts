import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const cerebrasAdapter: ProviderAdapter = {
  id: 'cerebras',
  pkg: '@ai-sdk/cerebras',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/cerebras',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createCerebras } = await import('@ai-sdk/cerebras');
    const c = cfg as Extract<ProviderConfig, { id: 'cerebras' }>;
    return createCerebras({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
