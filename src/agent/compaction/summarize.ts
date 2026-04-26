import { generateText } from 'ai';
import type { Run } from '@/server/types';
import { SubmoduleAgentRuntimeProvider } from '@/agent/provider/index';
import type { PartKind } from '@/agent/compaction/classify';

const SUMMARY_SYSTEM_PROMPT = `You are compressing tool outputs and assistant turns so a long agent
conversation fits in a context window. For each item, return a faithful
1-3 sentence summary that preserves: file paths, URLs, error messages,
exact identifiers, and any decision the assistant committed to. Drop:
verbatim file content, raw HTML, repeated logs. Reply with JSON only,
keyed by the supplied <<id>> markers.`;

const MAX_BATCH_TOKENS = 60_000;

export interface SummarizationItem {
  id: string;
  kind: PartKind;
  content: string;
  meta?: unknown;
}

export class CompactionSummarizer {
  public constructor(private readonly provider: SubmoduleAgentRuntimeProvider) {}

  public async summarize(run: Run, items: SummarizationItem[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (items.length === 0) return result;

    const batches = this.batch(items);
    const summaryModelId = run.config.compaction.summaryModel ?? run.config.model;
    const model = await this.provider.model({ ...run.config, model: summaryModelId });

    for (const batch of batches) {
      const userPrompt = this.buildPrompt(batch);
      try {
        const { text } = await generateText({
          model,
          system: SUMMARY_SYSTEM_PROMPT,
          prompt: userPrompt,
          abortSignal: run.abort.signal,
        });
        const parsed = parseJsonObject(text);
        for (const item of batch) {
          const summary = parsed[item.id];
          result.set(item.id, typeof summary === 'string' && summary.length > 0 ? summary : fallbackSummary(item));
        }
      } catch {
        for (const item of batch) result.set(item.id, fallbackSummary(item));
      }
    }
    return result;
  }

  private batch(items: SummarizationItem[]): SummarizationItem[][] {
    const batches: SummarizationItem[][] = [];
    let current: SummarizationItem[] = [];
    let currentChars = 0;
    const maxChars = MAX_BATCH_TOKENS * 4;
    for (const item of items) {
      const len = item.content.length + 64;
      if (current.length > 0 && currentChars + len > maxChars) {
        batches.push(current);
        current = [];
        currentChars = 0;
      }
      current.push(item);
      currentChars += len;
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }

  private buildPrompt(items: SummarizationItem[]): string {
    const lines: string[] = [];
    lines.push('Summarize each item below. Return a single JSON object whose keys are the <<id>> values.');
    lines.push('');
    for (const item of items) {
      lines.push(`<<${item.id}>> kind=${item.kind}`);
      lines.push(item.content);
      lines.push('');
    }
    return lines.join('\n');
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  if (!text) return {};
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    const v = JSON.parse(candidate);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const v = JSON.parse(candidate.slice(start, end + 1));
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  return {};
}

function fallbackSummary(item: SummarizationItem): string {
  const head = item.content.slice(0, 200).replace(/\s+/g, ' ').trim();
  return `[compaction summary unavailable] ${head}`;
}
