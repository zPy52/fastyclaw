import type { LanguageModel } from 'ai';
import type { AppConfig } from '@/server/types';

export interface ProviderResolver {
  model(config: AppConfig): Promise<LanguageModel>;
}
