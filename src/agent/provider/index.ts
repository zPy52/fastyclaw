import type { LanguageModel } from 'ai';
import type { AppConfig, ProviderConfig } from '@/server/types';
import {
  SubmoduleAgentRuntimeProviderRegistry,
  isModuleNotFound,
  type ProviderAdapter,
} from '@/agent/provider/registry';
import { openaiAdapter } from '@/agent/provider/adapters/openai';
import { anthropicAdapter } from '@/agent/provider/adapters/anthropic';
import { googleAdapter } from '@/agent/provider/adapters/google';
import { googleVertexAdapter } from '@/agent/provider/adapters/google-vertex';
import { azureAdapter } from '@/agent/provider/adapters/azure';
import { amazonBedrockAdapter } from '@/agent/provider/adapters/amazon-bedrock';
import { groqAdapter } from '@/agent/provider/adapters/groq';
import { mistralAdapter } from '@/agent/provider/adapters/mistral';
import { xaiAdapter } from '@/agent/provider/adapters/xai';
import { deepseekAdapter } from '@/agent/provider/adapters/deepseek';
import { perplexityAdapter } from '@/agent/provider/adapters/perplexity';
import { cohereAdapter } from '@/agent/provider/adapters/cohere';
import { togetheraiAdapter } from '@/agent/provider/adapters/togetherai';
import { fireworksAdapter } from '@/agent/provider/adapters/fireworks';
import { cerebrasAdapter } from '@/agent/provider/adapters/cerebras';
import { openaiCompatibleAdapter } from '@/agent/provider/adapters/openai-compatible';
import { gatewayAdapter } from '@/agent/provider/adapters/gateway';
import { claudeCodeAdapter } from '@/agent/provider/adapters/claude-code';
import { codexCliAdapter } from '@/agent/provider/adapters/codex-cli';
import { geminiCliAdapter } from '@/agent/provider/adapters/gemini-cli';
import { ollamaAdapter } from '@/agent/provider/adapters/ollama';
import { openrouterAdapter } from '@/agent/provider/adapters/openrouter';

const BUILTIN_ADAPTERS: ProviderAdapter[] = [
  openaiAdapter, anthropicAdapter, googleAdapter, googleVertexAdapter, azureAdapter,
  amazonBedrockAdapter, groqAdapter, mistralAdapter, xaiAdapter, deepseekAdapter,
  perplexityAdapter, cohereAdapter, togetheraiAdapter, fireworksAdapter, cerebrasAdapter,
  openaiCompatibleAdapter, gatewayAdapter,
  claudeCodeAdapter, codexCliAdapter, geminiCliAdapter,
  ollamaAdapter, openrouterAdapter,
];

export class ProviderNotInstalledError extends Error {
  public constructor(public readonly adapter: ProviderAdapter) {
    super(
      adapter.pkg
        ? `Provider '${adapter.id}' requires '${adapter.pkg}'. Run: npm i ${adapter.pkg}`
        : `Provider '${adapter.id}' is not available.`,
    );
    this.name = 'ProviderNotInstalledError';
  }
}

export class SubmoduleAgentRuntimeProvider {
  public readonly registry = new SubmoduleAgentRuntimeProviderRegistry();

  public constructor() {
    for (const adapter of BUILTIN_ADAPTERS) this.registry.register(adapter);
  }

  public async model(config: AppConfig): Promise<LanguageModel> {
    const adapter = this.registry.get(config.provider.id);
    if (!adapter) throw new Error(`Unknown provider: ${config.provider.id}`);
    try {
      return await adapter.create(config.provider, config.model);
    } catch (e) {
      if (isModuleNotFound(e)) throw new ProviderNotInstalledError(adapter);
      throw e;
    }
  }

  public async installed(adapter: ProviderAdapter): Promise<boolean> {
    if (!adapter.pkg) return true;
    try {
      await import(adapter.pkg);
      return true;
    } catch (e) {
      if (isModuleNotFound(e)) return false;
      return true;
    }
  }

  public async listModels(cfg: ProviderConfig): Promise<string[]> {
    const adapter = this.registry.get(cfg.id);
    if (!adapter?.listModels) return [];
    try { return await adapter.listModels(cfg); }
    catch { return []; }
  }
}
