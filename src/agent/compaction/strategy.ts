import type { UIMessage } from 'ai';

type AnyPart = UIMessage['parts'][number];

interface ToolPartOutputAvailable {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: 'output-available';
  input: unknown;
  output: unknown;
  callProviderMetadata?: unknown;
  resultProviderMetadata?: unknown;
  preliminary?: boolean;
  approval?: unknown;
}

export class CompactionStrategy {
  public stubFile(part: AnyPart): AnyPart {
    const tp = part as unknown as ToolPartOutputAvailable;
    const input = (tp.input ?? {}) as { path?: string };
    const prevOutput = (tp.output ?? {}) as { path?: string; totalLines?: number };
    return {
      ...tp,
      output: {
        compacted: true,
        path: prevOutput.path ?? input.path ?? null,
        totalLines: prevOutput.totalLines ?? null,
        summary: '[file content elided by compaction]',
      },
    } as unknown as AnyPart;
  }

  public stubWeb(part: AnyPart): AnyPart {
    const tp = part as unknown as ToolPartOutputAvailable;
    const input = (tp.input ?? {}) as { url?: string };
    const prevOutput = (tp.output ?? {}) as { url?: string; status?: number };
    return {
      ...tp,
      output: {
        compacted: true,
        url: prevOutput.url ?? input.url ?? null,
        status: prevOutput.status ?? null,
        summary: '[web content elided by compaction]',
      },
    } as unknown as AnyPart;
  }

  public stubImage(part: AnyPart): AnyPart {
    const tp = part as unknown as ToolPartOutputAvailable;
    const prevOutput = (tp.output ?? {}) as { paths?: unknown };
    return {
      ...tp,
      output: {
        compacted: true,
        paths: prevOutput.paths ?? null,
        summary: '[image content elided by compaction]',
      },
    } as unknown as AnyPart;
  }

  public dropImageData(part: AnyPart): AnyPart {
    const file = part as { filename?: string; mediaType?: string };
    const caption = file.filename ?? file.mediaType ?? 'image';
    return { type: 'text', text: `[compacted image: ${caption}]` } as unknown as AnyPart;
  }

  public summarizeText(part: AnyPart, summary: string): AnyPart {
    return { type: 'text', text: `[compacted] ${summary}` } as unknown as AnyPart;
  }

  public summarizeToolResult(part: AnyPart, summary: string): AnyPart {
    const tp = part as unknown as ToolPartOutputAvailable;
    return {
      ...tp,
      output: { compacted: true, summary },
    } as unknown as AnyPart;
  }
}
