import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';
import type { ProviderAdapter } from '@/agent/provider/registry';
import { toLanguageModel } from '@/agent/provider/adapters/shared';

export const ollamaAdapter: ProviderAdapter = {
  id: 'ollama',
  pkg: 'ollama-ai-provider',
  docsUrl: 'https://github.com/sgomez/ollama-ai-provider',
  async create(cfg, model): Promise<LanguageModel> {
    const mod = await import('ollama-ai-provider');
    const c = cfg as Extract<ProviderConfig, { id: 'ollama' }>;
    const factory = mod.createOllama
      ? mod.createOllama({ baseURL: c.baseURL, headers: c.headers })
      : mod.ollama;
    return toLanguageModel(factory(model));
  },
  async listModels(cfg): Promise<string[]> {
    const c = cfg as Extract<ProviderConfig, { id: 'ollama' }>;
    const base = (c.baseURL ?? 'http://localhost:11434/api').replace(/\/+$/, '');
    try {
      const res = await fetch(`${base}/tags`);
      if (!res.ok) return [];
      const json = (await res.json()) as { models?: Array<{ name: string }> };
      return (json.models ?? []).map((m) => m.name).sort();
    } catch {
      return [];
    }
  },
};
