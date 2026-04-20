import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const togetheraiAdapter: ProviderAdapter = {
  id: 'togetherai',
  pkg: '@ai-sdk/togetherai',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/togetherai',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createTogetherAI } = await import('@ai-sdk/togetherai');
    const c = cfg as Extract<ProviderConfig, { id: 'togetherai' }>;
    return createTogetherAI({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
