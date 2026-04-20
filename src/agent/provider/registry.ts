import type { LanguageModel } from 'ai';
import type { ProviderConfig, ProviderId } from '@/server/types';

export interface ProviderAdapter {
  id: ProviderId;
  pkg: string | null;
  docsUrl: string;
  create(cfg: ProviderConfig, model: string): Promise<LanguageModel>;
  listModels?(cfg: ProviderConfig): Promise<string[]>;
}

export class SubmoduleAgentRuntimeProviderRegistry {
  private readonly adapters = new Map<ProviderId, ProviderAdapter>();

  public register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public get(id: ProviderId | string): ProviderAdapter | undefined {
    return this.adapters.get(id as ProviderId);
  }

  public list(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export function isModuleNotFound(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: string }).code;
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
}
