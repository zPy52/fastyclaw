import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const googleAdapter: ProviderAdapter = {
  id: 'google',
  pkg: '@ai-sdk/google',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const c = cfg as Extract<ProviderConfig, { id: 'google' }>;
    return createGoogleGenerativeAI({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
  },
};
