import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const fireworksAdapter: ProviderAdapter = {
  id: 'fireworks',
  pkg: '@ai-sdk/fireworks',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/fireworks',
  async create(cfg, model): Promise<LanguageModel> {
    const { createFireworks } = await import('@ai-sdk/fireworks');
    const c = cfg as Extract<ProviderConfig, { id: 'fireworks' }>;
    return createFireworks({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
