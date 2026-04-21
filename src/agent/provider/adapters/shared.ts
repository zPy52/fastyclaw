import type { LanguageModel } from 'ai';

export type AdapterFactory = (modelId: string) => LanguageModel;

export function toLanguageModel(model: unknown): LanguageModel {
  return model as LanguageModel;
}
