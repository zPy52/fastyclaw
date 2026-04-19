import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Provider } from '@/server/types';

export class SubmoduleAgentRuntimeProvider {
  public model(name: string, provider: Provider): LanguageModel {
    if (provider === 'openai') {
      return openai(name);
    }
    throw new Error(`Unsupported provider: ${provider}`);
  }
}
