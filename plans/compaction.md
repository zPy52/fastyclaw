# Context Compaction

We want long threads to keep running without blowing the model's context window. Before each `streamText` call in [`src/agent/loop.ts`](../src/agent/loop.ts), estimate the prompt size; when it crosses a threshold, summarize and replace the heaviest oldest parts of `thread.messages` while preserving the system prompt, the latest user turn, and an N-message recent tail. Heavy parts are: `text` blocks above a size cutoff, file reads, fetched web pages, screenshots, and image-data.

---

## File layout

```
src/agent/compaction/
  index.ts          # SubmoduleAgentRuntimeCompaction (entry, called from loop)
  budget.ts         # token estimation + thresholds per model
  classify.ts       # decides what each UIMessage part costs and whether it is compactable
  strategy.ts       # part-type-specific compactors (text, file, image, web, screenshot, tool-call)
  summarize.ts      # LLM-driven summary call (uses run.provider, smaller model if configured)
  archive.ts        # writes the pre-compaction thread snapshot to disk
src/agent/types.ts   # +CompactionConfig, +CompactionResult
src/server/types.ts  # +AppConfig.compaction
src/config/index.ts  # +Const.archiveDir, defaults for compaction
```

---

## Config

Add to `AppConfig` in [`src/server/types.ts`](../src/server/types.ts):

```ts
export interface CompactionConfig {
  enabled: boolean;                    // default: true
  triggerRatio: number;                // 0..1 of contextWindow at which compaction fires; default 0.75
  targetRatio: number;                 // 0..1 to compact down to; default 0.45
  recentMessages: number;              // tail of messages to never touch; default 6
  textPartMaxTokens: number;           // text parts above this are compactable; default 1500
  summaryModel: string | null;         // override model for summarization; default null (use run.config.model)
  archiveOriginals: boolean;           // default: true
}
```

Surface defaults in `AppConfigStore.initialConfig()` and `Const`:

```ts
public static readonly archiveDir: string = path.join(ROOT_DIR, 'threads-archive');
public static readonly defaultCompaction: CompactionConfig = {
  enabled: true,
  triggerRatio: 0.75,
  targetRatio: 0.45,
  recentMessages: 6,
  textPartMaxTokens: 1500,
  summaryModel: null,
  archiveOriginals: true,
};
```

---

## Budget — token estimation & model windows

`src/agent/compaction/budget.ts`:

```ts
export interface ModelBudget {
  contextWindow: number;     // total input tokens the model accepts
  outputReserve: number;     // tokens reserved for the upcoming completion
  toolReserve: number;       // tokens reserved for tool schemas
}

export class CompactionBudget {
  // Heuristic, fast, no external tokenizer dep:
  //   text:        chars / 4
  //   image-data:  fixed 1500 (can refine per-provider later)
  //   file blocks: chars / 4 (line-numbered output is plain text)
  // Returns total prompt tokens for messages + system + tool schemas.
  public estimate(args: {
    system: string;
    messages: UIMessage[];
    toolSchemasJson: string;
  }): number;

  public forModel(modelId: string, providerId: ProviderId): ModelBudget;

  // How many tokens we must shed to hit targetRatio.
  public deficit(used: number, budget: ModelBudget, cfg: CompactionConfig): number;
}
```

`forModel` ships a static table for known IDs (`gpt-5.4-mini → 400_000`, `claude-sonnet-4-5 → 200_000`, `gemini-2.5-pro → 1_000_000`, etc.) with a conservative fallback of `128_000`. `outputReserve` defaults to `8_000`, `toolReserve` to `4_000`.

Token counts from the previous step's `streamText` `usage` are preferred over heuristic when available — `loop.ts` will feed `result.usage` back into the budget after each turn so the next-turn estimate is calibrated.

---

## Classify — what's expensive and what's safe to drop

`src/agent/compaction/classify.ts`:

```ts
export type PartKind =
  | 'text-small'        // keep verbatim
  | 'text-large'        // summarize
  | 'tool-call'         // keep header, drop input/output if old
  | 'tool-result-file'  // read_file output — replace with stub
  | 'tool-result-web'   // web_fetch output — replace with stub
  | 'tool-result-image' // see_image / screenshot — drop image-data
  | 'tool-result-other' // generic — summarize if large
  | 'image-data'        // top-level image part — drop, keep caption
  | 'system'            // never touched (system prompt is separate anyway)
  | 'user-latest';      // never touched

export interface ClassifiedPart {
  msgIndex: number;
  partIndex: number;
  kind: PartKind;
  estimatedTokens: number;
  toolName?: string;    // when kind starts with tool-
  toolCallId?: string;
}

export class CompactionClassifier {
  public classify(messages: UIMessage[], cfg: CompactionConfig): ClassifiedPart[];
}
```

Tool-name → kind mapping is the source of truth for which parts get which strategy:

| Tool name           | Result kind          |
|---------------------|----------------------|
| `read_file`         | `tool-result-file`   |
| `file_search`       | `tool-result-other`  |
| `web_fetch`         | `tool-result-web`    |
| `see_image`         | `tool-result-image`  |
| `screenshot`        | `tool-result-image`  |
| `browser`           | `tool-result-other`  |
| `run_shell` / `check_shell` | `tool-result-other` |
| anything else       | `tool-result-other`  |

The classifier also marks every part inside the last `cfg.recentMessages` messages as untouchable, plus the most recent `user` message regardless of position.

---

## Strategy — how each kind is rewritten

`src/agent/compaction/strategy.ts` exposes pure functions that take a `UIMessage` part and return a replacement part. They never reach for the LLM directly — `summarize.ts` does that and is called by `index.ts` once per batch for efficiency.

```ts
export class CompactionStrategy {
  public stubFile(p: ToolResultPart): ToolResultPart;
  public stubWeb(p: ToolResultPart): ToolResultPart;
  public stubImage(p: ToolResultPart): ToolResultPart;
  public dropImageData(p: ImagePart): TextPart;
  public summarizeText(p: TextPart, summary: string): TextPart;
  public summarizeToolResult(p: ToolResultPart, summary: string): ToolResultPart;
}
```

Replacement shapes (all retain their original `toolCallId` so the tool-call/tool-result pairing remains valid for the AI SDK):

```ts
// read_file  →
{ type: 'tool-result', toolCallId, toolName: 'read_file',
  output: { compacted: true, path, totalLines, summary: '<one-line>' } }

// web_fetch  →
{ type: 'tool-result', toolCallId, toolName: 'web_fetch',
  output: { compacted: true, url, status, summary: '<one-line>' } }

// see_image / screenshot  →
{ type: 'tool-result', toolCallId, toolName,
  output: { compacted: true, paths, summary: '<one-line caption>' } }

// large assistant text  →
{ type: 'text', text: '[compacted] ' + summary }

// top-level image-data part on a user message  →
{ type: 'text', text: `[compacted image: ${caption}]` }
```

`dropImageData` is the only strategy that changes a part's `type`; everything else preserves shape so the AI SDK's tool-pairing invariant holds.

---

## Summarize — the LLM call

`src/agent/compaction/summarize.ts`:

```ts
export class CompactionSummarizer {
  public constructor(
    private readonly provider: SubmoduleAgentRuntimeProvider,
  ) {}

  // Single batched call. Each item gets a stable id so we can map answers back.
  public async summarize(
    run: Run,
    items: Array<{ id: string; kind: PartKind; content: string; meta?: unknown }>,
  ): Promise<Map<string, string>>;
}
```

Implementation: one `generateText` call with `model = run.config.compaction.summaryModel ?? run.config.model`, a system prompt that asks for a JSON object `{ <id>: "<<= 60-word summary>" }`, and the items concatenated with `<<id>>` delimiters. Budget the summarization input itself — chunk into multiple calls if combined size > 60k tokens.

System prompt for summarization:

```
You are compressing tool outputs and assistant turns so a long agent
conversation fits in a context window. For each item, return a faithful
1–3 sentence summary that preserves: file paths, URLs, error messages,
exact identifiers, and any decision the assistant committed to. Drop:
verbatim file content, raw HTML, repeated logs. Reply with JSON only,
keyed by the supplied <<id>> markers.
```

---

## Entry — `SubmoduleAgentRuntimeCompaction`

`src/agent/compaction/index.ts`:

```ts
export interface CompactionResult {
  ranAt: number;
  beforeTokens: number;
  afterTokens: number;
  partsCompacted: number;
  archivedThreadPath: string | null;
}

export class SubmoduleAgentRuntimeCompaction {
  public constructor(
    private readonly budget: CompactionBudget,
    private readonly classifier: CompactionClassifier,
    private readonly strategy: CompactionStrategy,
    private readonly summarizer: CompactionSummarizer,
    private readonly archive: CompactionArchive,
  ) {}

  // Mutates run.thread.messages in place. Returns null if no-op.
  public async maybeRun(
    run: Run,
    systemPrompt: string,
    toolSchemasJson: string,
    lastUsageTokens: number | null,
  ): Promise<CompactionResult | null>;
}
```

`maybeRun` algorithm:

1. If `!run.config.compaction.enabled` → return `null`.
2. `used = lastUsageTokens ?? budget.estimate({ system, messages, toolSchemasJson })`.
3. `b = budget.forModel(model, providerId)`.
4. If `used < b.contextWindow * cfg.triggerRatio` → return `null`.
5. `deficit = used − b.contextWindow * cfg.targetRatio`.
6. `parts = classifier.classify(messages, cfg)` → filter out `system` / `user-latest` / parts inside the recent tail.
7. Sort `parts` oldest-first, then by `estimatedTokens` desc within the same message — drop image-data and file/web/image tool-results first (cheap, no LLM call needed); accumulate token savings until ≥ `deficit`.
8. If still short, batch-summarize the remaining selected `text-large` and `tool-result-other` parts via `summarizer.summarize(...)`.
9. If `cfg.archiveOriginals`, snapshot pre-compaction `thread.messages` to `~/.fastyclaw/threads-archive/<threadId>/<isoTimestamp>.json` before mutating.
10. Apply replacements through `strategy.*`, mutate `run.thread.messages`, return a `CompactionResult`.

---

## Archive

`src/agent/compaction/archive.ts`:

```ts
export class CompactionArchive {
  public async snapshot(threadId: string, messages: UIMessage[]): Promise<string>;
  public async list(threadId: string): Promise<string[]>;
}
```

`snapshot` writes to `path.join(Const.archiveDir, threadId, ${Date.now()}.json)`. `list` is exposed for a future `/threads/<id>/archive` route but not wired now.

---

## Wiring into the loop

Edit [`src/agent/loop.ts`](../src/agent/loop.ts):

```ts
export class SubmoduleAgentRuntimeLoop {
  public constructor(
    private readonly prompt: SubmoduleAgentRuntimePrompt,
    private readonly provider: SubmoduleAgentRuntimeProvider,
    private readonly compaction: SubmoduleAgentRuntimeCompaction,
  ) {}

  public async run(run: Run, userText: string, onMessages: ...): Promise<void> {
    // ...push user message, save eagerly...

    const system = this.prompt.build(run);
    const tools = AgentTools.all(run);
    const toolSchemasJson = JSON.stringify(
      Object.fromEntries(Object.entries(tools).map(([k, t]) => [k, t.inputSchema])),
    );

    const lastUsage = run.thread.lastUsageTokens ?? null;  // see Thread change below
    const compRes = await this.compaction.maybeRun(run, system, toolSchemasJson, lastUsage);
    if (compRes) {
      run.stream.write({ type: 'compaction', ...compRes });   // new ServerEvent variant
      await onMessages(run.thread.messages);                    // persist compacted thread
    }

    const result = streamText({ /* ...as before... */ });

    const uiStream = result.toUIMessageStream<UIMessage>({
      originalMessages: run.thread.messages,
      onFinish: async ({ messages }) => {
        run.thread.messages = messages;
        run.thread.lastUsageTokens = (await result.usage)?.totalTokens ?? null;
        await onMessages(run.thread.messages);
      },
    });
    // ...rest unchanged...
  }
}
```

Edits required outside the new directory:

- `Thread` in `src/server/types.ts`: add `lastUsageTokens?: number | null`.
- `ServerEvent` in `src/server/types.ts`: add `| { type: 'compaction'; ranAt: number; beforeTokens: number; afterTokens: number; partsCompacted: number }`.
- `SubmoduleFastyclawServerThreads` in `src/server/threads.ts`: persist `lastUsageTokens` alongside messages (change file shape from `messages[]` to `{ messages, lastUsageTokens }`, with backwards-compat read for legacy array form).
- Wherever `SubmoduleAgentRuntimeLoop` is constructed (likely `src/server/run.ts`): build the compaction module and inject it.

---

## Workflow

When a user message arrives, the loop builds the system prompt and tool schemas, then asks `compaction.maybeRun` whether the upcoming `streamText` call would exceed `triggerRatio` of the model's context window — using last turn's real `usage.totalTokens` if we have it, otherwise a `chars / 4` heuristic over messages + system + schemas. If under threshold, the loop proceeds untouched. If over, the classifier walks `thread.messages` skipping the last `recentMessages` and the latest user turn, then ranks parts oldest-first by token cost. Cheap drops (`see_image`/`screenshot` results, raw `image-data`, `read_file` outputs, `web_fetch` text) are stubbed with `{ compacted: true, ... }` payloads first; if the deficit isn't covered, the remaining large `text` parts and generic tool results are batch-summarized in a single `generateText` call against the configured `summaryModel` (or the active model). The pre-compaction thread is snapshotted to `~/.fastyclaw/threads-archive/<threadId>/<ts>.json`, the live `thread.messages` array is mutated in place, a `compaction` event is pushed onto the SSE stream so clients can render a divider, and the compacted thread is persisted before `streamText` is called normally.

---

## Tool-call / tool-result pairing — invariant to preserve

The AI SDK rejects message arrays where a `tool-call` part has no matching `tool-result` (or vice versa). Every strategy in `strategy.ts` keeps `toolCallId` and `toolName` intact and only rewrites `output` — never deletes whole parts. If a future strategy wants to drop a pair entirely, it must drop **both** the call part and its result part atomically; `strategy.ts` should expose a single `dropToolPair(toolCallId)` helper rather than letting callers prune one side.

---

## Out of scope

- Per-provider tokenizer accuracy (we rely on `usage` from the prior step plus a `chars/4` heuristic; tiktoken / anthropic-tokenizer can come later behind the same `CompactionBudget` interface).
- User-facing UI for browsing the archive directory.
- Automatic compaction of the archive itself.
- Mid-stream compaction (we only compact between turns, never inside an in-flight `streamText`).
