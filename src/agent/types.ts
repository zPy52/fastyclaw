import type { LanguageModel } from 'ai';
import type { AppConfig } from '@/server/types';

export interface ProviderResolver {
  model(config: AppConfig): Promise<LanguageModel>;
}

export interface CompactionResult {
  ranAt: number;
  beforeTokens: number;
  afterTokens: number;
  partsCompacted: number;
  archivedThreadPath: string | null;
}

export type { CompactionConfig } from '@/server/types';
