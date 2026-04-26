import type { UIMessage } from 'ai';
import type { CompactionConfig, ProviderId } from '@/server/types';

export interface ModelBudget {
  contextWindow: number;
  outputReserve: number;
  toolReserve: number;
}

interface ModelEntry {
  match: (id: string) => boolean;
  contextWindow: number;
}

const MODEL_TABLE: ModelEntry[] = [
  { match: (id) => id.startsWith('gpt-5.4-mini'), contextWindow: 400_000 },
  { match: (id) => id.startsWith('gpt-5'), contextWindow: 400_000 },
  { match: (id) => id.startsWith('gpt-4.1'), contextWindow: 1_000_000 },
  { match: (id) => id.startsWith('gpt-4o'), contextWindow: 128_000 },
  { match: (id) => id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4'), contextWindow: 200_000 },
  { match: (id) => id.includes('claude-opus'), contextWindow: 200_000 },
  { match: (id) => id.includes('claude-sonnet'), contextWindow: 200_000 },
  { match: (id) => id.includes('claude-haiku'), contextWindow: 200_000 },
  { match: (id) => id.includes('claude'), contextWindow: 200_000 },
  { match: (id) => id.includes('gemini-2.5-pro'), contextWindow: 1_000_000 },
  { match: (id) => id.includes('gemini-2.5-flash'), contextWindow: 1_000_000 },
  { match: (id) => id.includes('gemini-2.0'), contextWindow: 1_000_000 },
  { match: (id) => id.includes('gemini'), contextWindow: 1_000_000 },
  { match: (id) => id.includes('llama-3.3'), contextWindow: 128_000 },
  { match: (id) => id.includes('llama'), contextWindow: 128_000 },
  { match: (id) => id.includes('mistral-large'), contextWindow: 128_000 },
  { match: (id) => id.includes('deepseek'), contextWindow: 128_000 },
  { match: (id) => id.includes('grok'), contextWindow: 256_000 },
];

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_OUTPUT_RESERVE = 8_000;
const DEFAULT_TOOL_RESERVE = 4_000;

const IMAGE_TOKEN_COST = 1_500;

export class CompactionBudget {
  public estimate(args: {
    system: string;
    messages: UIMessage[];
    toolSchemasJson: string;
  }): number {
    let total = 0;
    total += charsToTokens(args.system.length);
    total += charsToTokens(args.toolSchemasJson.length);
    for (const m of args.messages) {
      total += this.estimateMessage(m);
    }
    return total;
  }

  public estimateMessage(message: UIMessage): number {
    let total = 0;
    for (const part of message.parts) {
      total += this.estimatePart(part);
    }
    return total;
  }

  public estimatePart(part: UIMessage['parts'][number]): number {
    const t = part.type;
    if (t === 'text' || t === 'reasoning') {
      const text = (part as { text?: string }).text ?? '';
      return charsToTokens(text.length);
    }
    if (t === 'file') {
      const file = part as { mediaType?: string; url?: string };
      if (file.mediaType?.startsWith('image/')) return IMAGE_TOKEN_COST;
      return charsToTokens((file.url ?? '').length);
    }
    if (t === 'step-start') return 0;
    if (t.startsWith('tool-') || t === 'dynamic-tool') {
      const tp = part as { input?: unknown; output?: unknown };
      let chars = 0;
      if (tp.input !== undefined) chars += safeJsonLength(tp.input);
      if (tp.output !== undefined) chars += safeJsonLength(tp.output);
      return charsToTokens(chars);
    }
    if (t.startsWith('source-')) {
      return charsToTokens(safeJsonLength(part));
    }
    if (t.startsWith('data-')) {
      return charsToTokens(safeJsonLength((part as { data?: unknown }).data ?? part));
    }
    return charsToTokens(safeJsonLength(part));
  }

  public forModel(modelId: string, _providerId: ProviderId): ModelBudget {
    const id = modelId.toLowerCase();
    const entry = MODEL_TABLE.find((e) => e.match(id));
    return {
      contextWindow: entry?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      outputReserve: DEFAULT_OUTPUT_RESERVE,
      toolReserve: DEFAULT_TOOL_RESERVE,
    };
  }

  public deficit(used: number, budget: ModelBudget, cfg: CompactionConfig): number {
    const target = budget.contextWindow * cfg.targetRatio;
    return Math.max(0, used - target);
  }
}

function charsToTokens(chars: number): number {
  if (chars <= 0) return 0;
  return Math.ceil(chars / 4);
}

function safeJsonLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}
