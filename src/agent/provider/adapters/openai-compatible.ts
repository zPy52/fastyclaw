import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const openaiCompatibleAdapter: ProviderAdapter = {
  id: 'openai-compatible',
  pkg: '@ai-sdk/openai-compatible',
  docsUrl: 'https://ai-sdk.dev/providers/openai-compatible-providers',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
    const c = cfg as Extract<ProviderConfig, { id: 'openai-compatible' }>;
    return createOpenAICompatible({
      name: c.name,
      apiKey: c.apiKey,
      baseURL: c.baseURL ?? '',
      headers: c.headers,
    })(model);
  },
};
