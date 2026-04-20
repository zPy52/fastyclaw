import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const codexCliAdapter: ProviderAdapter = {
  id: 'codex-cli',
  pkg: 'ai-sdk-provider-codex-cli',
  docsUrl: 'https://github.com/ben-vargas/ai-sdk-provider-codex-cli',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const mod = await import('ai-sdk-provider-codex-cli');
    const c = cfg as Extract<ProviderConfig, { id: 'codex-cli' }>;
    if (typeof mod.createCodexCli === 'function') {
      return mod.createCodexCli({ pathToCodexExecutable: c.binPath })(model);
    }
    return (mod.codexCli ?? mod.default)(model);
  },
};
