# Context Compaction

Long-running agent conversations accumulate tool outputs, file reads, web fetches, and images that can exhaust a model's context window. Compaction automatically trims that history so the agent can keep working without losing the thread of the conversation.

## How it works

Compaction runs at the start of every agent turn, before the next LLM call. The pipeline has five stages:

### 1. Budget check

fastyclaw estimates the current token count from the system prompt, tool schemas, and all messages in the thread. The estimate uses a 1 char ≈ 0.25 token heuristic, with a flat 1 500-token cost for inline images.

If the estimate is below `triggerRatio × contextWindow`, compaction is skipped entirely. If actual usage tokens are available from the previous API response, those are used instead of the estimate.

### 2. Classify

Every message part is assigned a kind:

| Kind | What it is | Protected? |
|---|---|---|
| `untouchable` | Reasoning traces, step markers, pending tool calls, non-image files | Always |
| `text-small` | Text parts under `textPartMaxTokens` tokens | Always |
| `text-large` | Text parts over `textPartMaxTokens` tokens | No |
| `tool-result-file` | Output of `read_file` / `edit_file` | No |
| `tool-result-web` | Output of `web_fetch` | No |
| `tool-result-image` | Output of `see_image` / `screenshot` | No |
| `tool-result-other` | Output of `run_shell`, `check_shell`, `file_search`, `browser` | No |
| `image-data` | Inline `file` parts with an `image/*` media type | No |

Parts belonging to the most recent `recentMessages` messages, and the last user message, are always marked `untouchable` regardless of their kind.

### 3. Select

Compaction calculates a token deficit — how far above `targetRatio × contextWindow` the conversation is — and greedily picks parts to compact, oldest first, until the deficit is covered.

Priority order:

1. **Free drops** — `image-data`, `tool-result-image`, `tool-result-file`, `tool-result-web`. These are replaced with a stub that preserves the path/URL and a short notice. No LLM call needed.
2. **Summarizer** — `text-large` and `tool-result-other`. The original content is sent to a small summarization model, and the result replaces the original.

### 4. Summarize

Parts that need summarization are batched (up to ~60 000 tokens per batch) and sent to the configured `summaryModel` (defaults to the same model as the agent). The summarizer is instructed to preserve file paths, URLs, error messages, exact identifiers, and decisions, while dropping verbatim file content, raw HTML, and repeated logs.

If the summarizer call fails for any batch, a short fallback summary is written instead — compaction never hard-fails a turn.

### 5. Archive

If `archiveOriginals` is `true` (the default), the full message array is serialized to `~/.fastyclaw/archive/<threadId>/<timestamp>.json` before any parts are modified. This lets you inspect what was compacted.

---

## Configuration

The `compaction` block lives inside the main config. All fields are optional — missing fields fall back to their defaults.

```json
{
  "compaction": {
    "enabled": true,
    "triggerRatio": 0.75,
    "targetRatio": 0.45,
    "recentMessages": 6,
    "textPartMaxTokens": 1500,
    "summaryModel": null,
    "archiveOriginals": true
  }
}
```

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Set to `false` to disable compaction entirely |
| `triggerRatio` | `0.75` | Compaction fires when estimated usage exceeds this fraction of the context window |
| `targetRatio` | `0.45` | After compaction, aim to be at or below this fraction of the context window |
| `recentMessages` | `6` | The N most recent messages are never compacted |
| `textPartMaxTokens` | `1500` | Text parts larger than this token count are eligible for summarization |
| `summaryModel` | `null` | Model ID to use for summarization. `null` uses the same model as the agent |
| `archiveOriginals` | `true` | Snapshot the thread to disk before each compaction run |

### Patch via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"compaction":{"triggerRatio":0.8,"summaryModel":"gpt-4.1-mini"}}'
```

### Patch via client SDK

```ts
await client.setConfig({
  compaction: { triggerRatio: 0.8, summaryModel: 'gpt-4.1-mini' },
});
```

### Disable compaction

```bash
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"compaction":{"enabled":false}}'
```

---

## Context window sizes

fastyclaw has a built-in table of context window sizes used for the trigger/target calculations:

| Model family | Context window |
|---|---|
| `gpt-4.1*` | 1 000 000 |
| `gemini-2.5-*`, `gemini-2.0-*`, `gemini-*` | 1 000 000 |
| `gpt-5*`, `gpt-5.4-mini*` | 400 000 |
| `claude-*` (all variants) | 200 000 |
| `o1`, `o3`, `o4*` | 200 000 |
| `grok-*` | 256 000 |
| `llama-*`, `mistral-large*`, `deepseek-*`, `gpt-4o*` | 128 000 |
| Everything else | 128 000 |

---

## Archive layout

Each compaction snapshot is written to:

```
~/.fastyclaw/archive/<threadId>/<unix-timestamp-ms>.json
```

The file contains the raw `UIMessage[]` array serialized as JSON. Multiple snapshots for the same thread are sorted chronologically by filename. You can list them with:

```bash
ls ~/.fastyclaw/archive/<threadId>/
```

---

## SSE event

When compaction runs, a `compaction` event is emitted on the SSE stream before the first model chunk:

```json
{
  "type": "compaction",
  "ranAt": 1714000000000,
  "beforeTokens": 152400,
  "afterTokens": 88200,
  "partsCompacted": 11
}
```
