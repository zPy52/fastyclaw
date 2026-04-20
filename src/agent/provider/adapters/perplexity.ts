import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const perplexityAdapter: ProviderAdapter = {
  id: 'perplexity',
  pkg: '@ai-sdk/perplexity',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/perplexity',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createPerplexity } = await import('@ai-sdk/perplexity');
    const c = cfg as Extract<ProviderConfig, { id: 'perplexity' }>;
    return createPerplexity({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
