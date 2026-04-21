import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';
import { type AdapterFactory, toLanguageModel } from '@/agent/provider/adapters/shared';

export const codexCliAdapter: ProviderAdapter = {
  id: 'codex-cli',
  pkg: 'ai-sdk-provider-codex-cli',
  docsUrl: 'https://github.com/ben-vargas/ai-sdk-provider-codex-cli',
  async create(cfg, model): Promise<LanguageModel> {
    const mod = await import('ai-sdk-provider-codex-cli');
    const c = cfg as Extract<ProviderConfig, { id: 'codex-cli' }>;
    const createCodexCli = mod.createCodexCli as
      | ((options?: { defaultSettings?: { codexPath?: string } }) => AdapterFactory)
      | undefined;
    if (createCodexCli) {
      return createCodexCli(
        c.binPath
          ? { defaultSettings: { codexPath: c.binPath } }
          : undefined,
      )(model);
    }
    if (typeof mod.codexCli === 'function') {
      return toLanguageModel(mod.codexCli(model));
    }
    throw new Error('Codex CLI provider export is not available.');
  },
};
