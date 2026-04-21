import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';
import { toLanguageModel, type AdapterFactory } from '@/agent/provider/adapters/shared';

export const claudeCodeAdapter: ProviderAdapter = {
  id: 'claude-code',
  pkg: 'ai-sdk-provider-claude-code',
  docsUrl: 'https://github.com/ben-vargas/ai-sdk-provider-claude-code',
  async create(cfg, model): Promise<LanguageModel> {
    const mod = await import('ai-sdk-provider-claude-code');
    const c = cfg as Extract<ProviderConfig, { id: 'claude-code' }>;
    const createClaudeCode = mod.createClaudeCode as
      | ((options?: { defaultSettings?: { pathToClaudeCodeExecutable?: string } }) => AdapterFactory)
      | undefined;
    if (createClaudeCode) {
      return createClaudeCode(
        c.binPath
          ? { defaultSettings: { pathToClaudeCodeExecutable: c.binPath } }
          : undefined,
      )(model);
    }
    if (typeof mod.claudeCode === 'function') {
      return toLanguageModel(mod.claudeCode(model));
    }
    throw new Error('Claude Code provider export is not available.');
  },
};
