import type { LanguageModel } from 'ai';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const geminiCliAdapter: ProviderAdapter = {
  id: 'gemini-cli',
  pkg: 'ai-sdk-provider-gemini-cli',
  docsUrl: 'https://github.com/ben-vargas/ai-sdk-provider-gemini-cli',
  async create(cfg, model): Promise<LanguageModel> {
    void cfg;
    const mod = await import('ai-sdk-provider-gemini-cli');
    const createGeminiProvider = mod.createGeminiProvider ?? mod.createGeminiCliCoreProvider;
    if (typeof createGeminiProvider !== 'function') {
      throw new Error('Gemini CLI provider export is not available.');
    }
    return createGeminiProvider()(model);
  },
};
