import type { UIMessage } from 'ai';
import type { Run } from '@/server/types';
import type { CompactionResult } from '@/agent/types';
import { CompactionBudget } from '@/agent/compaction/budget';
import { CompactionClassifier, type ClassifiedPart, type PartKind } from '@/agent/compaction/classify';
import { CompactionStrategy } from '@/agent/compaction/strategy';
import { CompactionSummarizer, type SummarizationItem } from '@/agent/compaction/summarize';
import { CompactionArchive } from '@/agent/compaction/archive';
import { SubmoduleAgentRuntimeProvider } from '@/agent/provider/index';

const NEEDS_SUMMARIZER: ReadonlySet<PartKind> = new Set<PartKind>(['text-large', 'tool-result-other']);
const FREE_DROP_KINDS: ReadonlySet<PartKind> = new Set<PartKind>([
  'image-data',
  'tool-result-image',
  'tool-result-file',
  'tool-result-web',
]);

export class SubmoduleAgentRuntimeCompaction {
  public constructor(
    public readonly budget: CompactionBudget,
    public readonly classifier: CompactionClassifier,
    public readonly strategy: CompactionStrategy,
    public readonly summarizer: CompactionSummarizer,
    public readonly archive: CompactionArchive,
  ) {}

  public static create(provider: SubmoduleAgentRuntimeProvider): SubmoduleAgentRuntimeCompaction {
    const budget = new CompactionBudget();
    return new SubmoduleAgentRuntimeCompaction(
      budget,
      new CompactionClassifier(budget),
      new CompactionStrategy(),
      new CompactionSummarizer(provider),
      new CompactionArchive(),
    );
  }

  public async maybeRun(
    run: Run,
    systemPrompt: string,
    toolSchemasJson: string,
    lastUsageTokens: number | null,
  ): Promise<CompactionResult | null> {
    const cfg = run.config.compaction;
    if (!cfg.enabled) return null;

    const messages = run.thread.messages;
    const used = lastUsageTokens
      ?? this.budget.estimate({ system: systemPrompt, messages, toolSchemasJson });
    const b = this.budget.forModel(run.config.model, run.config.provider.id);
    const trigger = b.contextWindow * cfg.triggerRatio;
    if (used < trigger) return null;

    const deficit = this.budget.deficit(used, b, cfg);
    if (deficit <= 0) return null;

    const classified = this.classifier.classify(messages, cfg);
    const compactable = classified.filter((p) => p.kind !== 'untouchable' && p.kind !== 'text-small');

    compactable.sort((a, b) => {
      if (a.msgIndex !== b.msgIndex) return a.msgIndex - b.msgIndex;
      return b.estimatedTokens - a.estimatedTokens;
    });

    const selected: ClassifiedPart[] = [];
    let saved = 0;
    for (const p of compactable) {
      if (FREE_DROP_KINDS.has(p.kind)) {
        selected.push(p);
        saved += p.estimatedTokens;
        if (saved >= deficit) break;
      }
    }
    if (saved < deficit) {
      for (const p of compactable) {
        if (!FREE_DROP_KINDS.has(p.kind) && NEEDS_SUMMARIZER.has(p.kind)) {
          selected.push(p);
          saved += p.estimatedTokens;
          if (saved >= deficit) break;
        }
      }
    }

    if (selected.length === 0) return null;

    const summarizable = selected.filter((p) => NEEDS_SUMMARIZER.has(p.kind));
    const summaries = summarizable.length > 0
      ? await this.summarizer.summarize(run, summarizable.map((p) => this.toSummarizationItem(p, messages)))
      : new Map<string, string>();

    let archivedThreadPath: string | null = null;
    if (cfg.archiveOriginals) {
      try {
        archivedThreadPath = await this.archive.snapshot(run.thread.id, messages);
      } catch {
        archivedThreadPath = null;
      }
    }

    let partsCompacted = 0;
    for (const p of selected) {
      const msg = messages[p.msgIndex];
      const part = msg.parts[p.partIndex];
      const replacement = this.replacePart(p, part, summaries);
      if (replacement) {
        msg.parts[p.partIndex] = replacement as UIMessage['parts'][number];
        partsCompacted++;
      }
    }

    const afterTokens = this.budget.estimate({ system: systemPrompt, messages, toolSchemasJson });

    return {
      ranAt: Date.now(),
      beforeTokens: used,
      afterTokens,
      partsCompacted,
      archivedThreadPath,
    };
  }

  private toSummarizationItem(p: ClassifiedPart, messages: UIMessage[]): SummarizationItem {
    const part = messages[p.msgIndex].parts[p.partIndex];
    const id = `m${p.msgIndex}_p${p.partIndex}`;
    let content = '';
    if (p.kind === 'text-large') {
      content = (part as { text?: string }).text ?? '';
    } else {
      const tp = part as { input?: unknown; output?: unknown };
      content = safeStringify({ input: tp.input, output: tp.output });
    }
    return { id, kind: p.kind, content, meta: { toolName: p.toolName, toolCallId: p.toolCallId } };
  }

  private replacePart(
    classified: ClassifiedPart,
    part: UIMessage['parts'][number],
    summaries: Map<string, string>,
  ): UIMessage['parts'][number] | null {
    const id = `m${classified.msgIndex}_p${classified.partIndex}`;
    switch (classified.kind) {
      case 'image-data':
        return this.strategy.dropImageData(part);
      case 'tool-result-file':
        return this.strategy.stubFile(part);
      case 'tool-result-web':
        return this.strategy.stubWeb(part);
      case 'tool-result-image':
        return this.strategy.stubImage(part);
      case 'text-large':
        return this.strategy.summarizeText(part, summaries.get(id) ?? '[summary unavailable]');
      case 'tool-result-other':
        return this.strategy.summarizeToolResult(part, summaries.get(id) ?? '[summary unavailable]');
      default:
        return null;
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
