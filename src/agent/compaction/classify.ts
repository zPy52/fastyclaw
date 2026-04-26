import type { UIMessage } from 'ai';
import type { CompactionConfig } from '@/server/types';
import { CompactionBudget } from '@/agent/compaction/budget';

export type PartKind =
  | 'text-small'
  | 'text-large'
  | 'tool-result-file'
  | 'tool-result-web'
  | 'tool-result-image'
  | 'tool-result-other'
  | 'image-data'
  | 'untouchable';

export interface ClassifiedPart {
  msgIndex: number;
  partIndex: number;
  kind: PartKind;
  estimatedTokens: number;
  toolName?: string;
  toolCallId?: string;
}

const TOOL_KIND: Record<string, PartKind> = {
  read_file: 'tool-result-file',
  edit_file: 'tool-result-file',
  file_search: 'tool-result-other',
  web_fetch: 'tool-result-web',
  see_image: 'tool-result-image',
  screenshot: 'tool-result-image',
  browser: 'tool-result-other',
  run_shell: 'tool-result-other',
  check_shell: 'tool-result-other',
};

export class CompactionClassifier {
  public constructor(private readonly budget: CompactionBudget = new CompactionBudget()) {}

  public classify(messages: UIMessage[], cfg: CompactionConfig): ClassifiedPart[] {
    const out: ClassifiedPart[] = [];
    const recentStart = Math.max(0, messages.length - cfg.recentMessages);
    const lastUserIdx = findLastUserIndex(messages);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const inRecent = i >= recentStart;
      const isLastUser = i === lastUserIdx;
      const protect = inRecent || isLastUser;

      for (let p = 0; p < msg.parts.length; p++) {
        const part = msg.parts[p];
        const tokens = this.budget.estimatePart(part);
        if (protect) {
          out.push({ msgIndex: i, partIndex: p, kind: 'untouchable', estimatedTokens: tokens });
          continue;
        }
        const kindInfo = classifyPart(part, cfg);
        out.push({
          msgIndex: i,
          partIndex: p,
          kind: kindInfo.kind,
          estimatedTokens: tokens,
          toolName: kindInfo.toolName,
          toolCallId: kindInfo.toolCallId,
        });
      }
    }
    return out;
  }
}

function findLastUserIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

function classifyPart(
  part: UIMessage['parts'][number],
  cfg: CompactionConfig,
): { kind: PartKind; toolName?: string; toolCallId?: string } {
  const t = part.type;

  if (t === 'text') {
    const text = (part as { text?: string }).text ?? '';
    const tokens = Math.ceil(text.length / 4);
    return { kind: tokens > cfg.textPartMaxTokens ? 'text-large' : 'text-small' };
  }
  if (t === 'reasoning' || t === 'step-start') {
    return { kind: 'untouchable' };
  }
  if (t === 'file') {
    const file = part as { mediaType?: string };
    if (file.mediaType?.startsWith('image/')) return { kind: 'image-data' };
    return { kind: 'untouchable' };
  }
  if (t === 'dynamic-tool') {
    const tp = part as { state?: string; toolName?: string; toolCallId?: string };
    if (tp.state !== 'output-available') return { kind: 'untouchable' };
    const name = tp.toolName ?? '';
    return { kind: TOOL_KIND[name] ?? 'tool-result-other', toolName: name, toolCallId: tp.toolCallId };
  }
  if (t.startsWith('tool-')) {
    const tp = part as { state?: string; toolCallId?: string };
    if (tp.state !== 'output-available') return { kind: 'untouchable' };
    const toolName = t.slice('tool-'.length);
    return { kind: TOOL_KIND[toolName] ?? 'tool-result-other', toolName, toolCallId: tp.toolCallId };
  }
  return { kind: 'untouchable' };
}
