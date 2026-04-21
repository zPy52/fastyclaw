import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const googleVertexAdapter: ProviderAdapter = {
  id: 'google-vertex',
  pkg: '@ai-sdk/google-vertex',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex',
  async create(cfg, model): Promise<LanguageModel> {
    const { createVertex } = await import('@ai-sdk/google-vertex');
    const c = cfg as Extract<ProviderConfig, { id: 'google-vertex' }>;
    return createVertex({
      project: c.project,
      location: c.location,
      baseURL: c.baseURL,
      headers: c.headers,
    })(model);
  },
};
