import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const geminiCliAdapter: ProviderAdapter = {
  id: 'gemini-cli',
  pkg: 'ai-sdk-provider-gemini-cli',
  docsUrl: 'https://github.com/ben-vargas/ai-sdk-provider-gemini-cli',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const mod = await import('ai-sdk-provider-gemini-cli');
    const c = cfg as Extract<ProviderConfig, { id: 'gemini-cli' }>;
    if (typeof mod.createGeminiCli === 'function') {
      return mod.createGeminiCli({ pathToGeminiExecutable: c.binPath })(model);
    }
    return (mod.geminiCli ?? mod.default)(model);
  },
};
