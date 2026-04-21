import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const amazonBedrockAdapter: ProviderAdapter = {
  id: 'amazon-bedrock',
  pkg: '@ai-sdk/amazon-bedrock',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock',
  async create(cfg, model): Promise<LanguageModel> {
    const { createAmazonBedrock } = await import('@ai-sdk/amazon-bedrock');
    const c = cfg as Extract<ProviderConfig, { id: 'amazon-bedrock' }>;
    return createAmazonBedrock({
      region: c.region,
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      sessionToken: c.sessionToken,
    })(model);
  },
};
