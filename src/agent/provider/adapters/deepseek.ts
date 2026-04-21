import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const deepseekAdapter: ProviderAdapter = {
  id: 'deepseek',
  pkg: '@ai-sdk/deepseek',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/deepseek',
  async create(cfg, model): Promise<LanguageModel> {
    const { createDeepSeek } = await import('@ai-sdk/deepseek');
    const c = cfg as Extract<ProviderConfig, { id: 'deepseek' }>;
    return createDeepSeek({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
