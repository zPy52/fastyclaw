import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const gatewayAdapter: ProviderAdapter = {
  id: 'gateway',
  pkg: null,
  docsUrl: 'https://ai-sdk.dev/docs/ai-sdk-core/provider-management',
  async create(cfg, model): Promise<LanguageModel> {
    const aiMod = (await import('ai')) as unknown as Record<string, unknown>;
    const c = cfg as Extract<ProviderConfig, { id: 'gateway' }>;
    const createGateway = aiMod.createGateway as
      | ((opts: { apiKey?: string; baseURL?: string; headers?: Record<string, string> }) => (m: string) => LanguageModel)
      | undefined;
    if (createGateway) {
      return createGateway({ apiKey: c.apiKey, baseURL: c.baseURL, headers: c.headers })(model);
    }
    const gw = aiMod.gateway as unknown;
    if (typeof gw === 'function') return (gw as (m: string) => LanguageModel)(model);
    if (gw && typeof gw === 'object') {
      const lm = (gw as { languageModel?: (m: string) => LanguageModel }).languageModel;
      if (typeof lm === 'function') return lm(model);
    }
    throw new Error('AI Gateway is not available in this version of `ai`.');
  },
};
