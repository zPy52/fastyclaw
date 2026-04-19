import type { LanguageModel } from 'ai';
import type { Provider } from '@/server/types';

export interface ProviderResolver {
  model(name: string, provider: Provider): LanguageModel;
}
