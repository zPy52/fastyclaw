import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const azureAdapter: ProviderAdapter = {
  id: 'azure',
  pkg: '@ai-sdk/azure',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/azure',
  async create(cfg, model): Promise<LanguageModel> {
    const { createAzure } = await import('@ai-sdk/azure');
    const c = cfg as Extract<ProviderConfig, { id: 'azure' }>;
    return createAzure({
      apiKey: c.apiKey,
      resourceName: c.resourceName,
      apiVersion: c.apiVersion,
      baseURL: c.baseURL,
      headers: c.headers,
    })(model);
  },
};
