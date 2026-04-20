import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';

export const claudeCodeAdapter: ProviderAdapter = {
  id: 'claude-code',
  pkg: 'ai-sdk-provider-claude-code',
  docsUrl: 'https://github.com/ben-vargas/ai-sdk-provider-claude-code',
  async create(cfg, model): Promise<LanguageModel> {
    // @ts-expect-error optional dep
    const mod = await import('ai-sdk-provider-claude-code');
    const c = cfg as Extract<ProviderConfig, { id: 'claude-code' }>;
    if (typeof mod.createClaudeCode === 'function') {
      return mod.createClaudeCode({ pathToClaudeCodeExecutable: c.binPath })(model);
    }
    const factory = mod.claudeCode ?? mod.default;
    return factory(model);
  },
};
