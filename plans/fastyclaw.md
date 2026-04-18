# fastyclaw

A small local agent harness: `npm i -g fastyclaw` installs a CLI that boots an Express server on `localhost`; a TypeScript client SDK drives it (model selection, message sending, streamed events). The agent runs an unbounded tool-call loop powered by the Vercel AI SDK with the OpenAI provider, exposes a fixed set of harness tools, and loads skills from `~/.agents/skills/`.

---

## Package layout

```txt
fastyclaw/
├── package.json              # "bin": { "fastyclaw": "./dist/cli.js" }, "main": "./dist/index.js"
├── tsconfig.json
└── src/
    ├── cli.ts                # #!/usr/bin/env node — parses `start`, calls FastyclawServer.start()
    ├── index.ts              # exports { FastyclawClient } for SDK consumers
    ├── config/
    │   └── index.ts          # Const (port, paths, defaults)
    ├── server/
    │   ├── index.ts          # FastyclawServer (static)
    │   ├── types.ts
    │   ├── routes.ts         # SubmoduleFastyclawServerRoutes
    │   ├── session.ts        # SubmoduleFastyclawServerSession
    │   └── stream.ts         # SubmoduleFastyclawServerStream (SSE writer)
    ├── agent/
    │   ├── index.ts          # AgentRuntime (static)
    │   ├── types.ts
    │   ├── loop.ts           # SubmoduleAgentRuntimeLoop
    │   ├── provider.ts       # SubmoduleAgentRuntimeProvider
    │   ├── prompt.ts         # SubmoduleAgentRuntimePrompt  (system prompt builder)
    │   └── tools/
    │       ├── index.ts      # AgentTools (static) — exposes .all()
    │       ├── semantic-search.ts
    │       ├── file-search.ts
    │       ├── web-fetch.ts
    │       ├── get-rules.ts
    │       ├── read-file.ts
    │       ├── edit-file.ts
    │       ├── run-shell.ts
    │       └── browser.ts
    ├── skills/
    │   ├── index.ts          # AgentSkills (static)
    │   ├── types.ts
    │   ├── loader.ts         # SubmoduleAgentSkillsLoader   (disk → registry)
    │   ├── registry.ts       # SubmoduleAgentSkillsRegistry (in-memory map)
    │   └── prompt.ts         # SubmoduleAgentSkillsPrompt   (renders system-prompt block)
    └── client/
        ├── index.ts          # FastyclawClient (instantiable — holds baseUrl + sessionId)
        └── types.ts
```

Dependencies: `ai`, `@ai-sdk/openai`, `zod`, `express`, `gray-matter` (skill frontmatter), `eventsource-parser` (client SSE), `glob`.

---

## Transport — HTTP + SSE

| Method | Path                                  | Purpose                                                                 |
|--------|---------------------------------------|-------------------------------------------------------------------------|
| POST   | `/sessions`                           | Create session. Returns `{ sessionId }`.                                |
| POST   | `/sessions/:id/config`                | Body `{ model?, provider?, cwd? }`. Updates session config.             |
| POST   | `/sessions/:id/messages`              | Body `{ text }`. Streams SSE events until the turn ends.                |
| DELETE | `/sessions/:id`                       | Terminates session and aborts any running turn.                         |

SSE event types written to the `/messages` response stream:

```ts
type ServerEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; name: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; output: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' };
```

---

## Client SDK

```ts
// src/client/index.ts
export class FastyclawClient {
  constructor(opts?: { baseUrl?: string });          // default http://localhost:5177
  public async connect(): Promise<void>;             // creates session, stores sessionId
  public async setModel(model: string): Promise<void>;
  public async setProvider(provider: 'openai'): Promise<void>;
  public async setCwd(cwd: string): Promise<void>;
  public sendMessage(text: string): AsyncIterable<ServerEvent>;
  public async close(): Promise<void>;
}
```

`sendMessage` returns an async iterator yielding `ServerEvent`s parsed from SSE.

---

## Agent runtime

```ts
// src/agent/loop.ts (pseudo-shape — use real AI SDK API)
import { streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai(session.model),
  system: AgentRuntime.prompt.build(session),       // base + skills block + rules
  messages: session.messages,
  tools: AgentTools.all(session),                   // bound to session (cwd, stream)
  stopWhen: stepCountIs(Number.MAX_SAFE_INTEGER),   // unbounded tool-call loop
  abortSignal: session.abort.signal,
});
```

`AgentRuntime.loop.run(session, userText)`:

1. Append user message to `session.messages`.
2. Call `streamText` as above.
3. Pipe `result.fullStream` parts → `ServerEvent`s via `SubmoduleFastyclawServerStream`.
4. Collect the final assistant message back into `session.messages`.
5. Emit `{ type: 'done' }` and end the SSE response.

Errors are caught, emitted as `{ type: 'error' }`, then `done`.

---

## Harness tools

Each tool lives in its own file and exports a `tool({...})` factory that takes `session` and returns the AI SDK tool object. `AgentTools.all(session)` returns the record keyed by tool name.

| Name              | Input (zod)                                                   | Behavior                                                                     |
|-------------------|---------------------------------------------------------------|------------------------------------------------------------------------------|
| `semantic_search` | `{ query: string, path?: string, k?: number }`                | Embeds query via OpenAI `text-embedding-3-small`; ranks files under `cwd`. In-memory index per session, lazily built.  |
| `file_search`     | `{ pattern: string }`                                         | `glob(pattern, { cwd: session.cwd })`.                                       |
| `web_fetch`       | `{ url: string, prompt?: string }`                            | `fetch(url)` → HTML→text; if `prompt`, summarize via same OpenAI model.      |
| `get_rules`       | `{}`                                                          | Reads nearest `AGENTS.md` walking up from `session.cwd`, concatenates.       |
| `read_file`       | `{ path: string, offset?: number, limit?: number }`           | Reads file; returns lines with 1-based numbers.                              |
| `edit_file`       | `{ path: string, old: string, new: string, replaceAll?: bool }`| Exact string replace; errors if `old` not unique (unless `replaceAll`).     |
| `run_shell`       | `{ command: string, cwd?: string, timeoutMs?: number }`       | `execa` in `session.cwd`; streams stdout/stderr deltas as `text-delta`.      |
| `browser`         | `{ url: string, action: 'open'\|'screenshot'\|'extract' }`    | Playwright headless; single shared browser per session, launched on demand.  |

---

## AgentSkills module (modular-code)

Follows modular-code conventions: static root `AgentSkills`, instance submodules attached as `public static readonly`.

```ts
// src/skills/types.ts
export interface Skill {
  name: string;                // from frontmatter `name` or directory name
  description: string;         // from frontmatter `description` — used in system prompt
  triggers?: string[];         // optional glob/keyword hints
  body: string;                // markdown body (loaded on demand)
  path: string;                // absolute path to SKILL.md
}

// src/skills/registry.ts
export class SubmoduleAgentSkillsRegistry {
  private skills = new Map<string, Skill>();
  public set(skill: Skill): void;
  public get(name: string): Skill | undefined;
  public list(): Skill[];
  public clear(): void;
}

// src/skills/loader.ts
export class SubmoduleAgentSkillsLoader {
  // Reads ~/.agents/skills/<name>/SKILL.md, parses frontmatter, fills registry.
  public async load(): Promise<void>;
  public async reload(): Promise<void>;
  public dir(): string;  // os.homedir() + '/.agents/skills'
}

// src/skills/prompt.ts
export class SubmoduleAgentSkillsPrompt {
  // Renders the "Available skills" block for the system prompt (names + descriptions).
  public render(): string;
  // Returns the full body of a skill, for tool-based lazy loading.
  public body(name: string): string | undefined;
}

// src/skills/index.ts
import { SubmoduleAgentSkillsRegistry } from './registry';
import { SubmoduleAgentSkillsLoader }   from './loader';
import { SubmoduleAgentSkillsPrompt }   from './prompt';

export class AgentSkills {
  public static readonly registry = new SubmoduleAgentSkillsRegistry();
  public static readonly loader   = new SubmoduleAgentSkillsLoader(AgentSkills.registry);
  public static readonly prompt   = new SubmoduleAgentSkillsPrompt(AgentSkills.registry);
}
```

Skill file format at `~/.agents/skills/<name>/SKILL.md`:

```markdown
---
name: pdf
description: Read, edit, and create PDF files.
triggers: ["*.pdf"]
---

# PDF skill body
Step-by-step instructions for the agent…
```

System prompt embeds only the name+description list (via `AgentSkills.prompt.render()`). A future `load_skill` tool can fetch full bodies on demand — out of scope for v1; names+descriptions are enough.

---

## Provider abstraction

```ts
// src/agent/provider.ts
export class SubmoduleAgentRuntimeProvider {
  public model(name: string, provider: 'openai'): LanguageModel {
    if (provider === 'openai') return openai(name);
    throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

Only `openai` for v1. Adding a provider later = one branch here + one dependency.

---

## CLI

```ts
// src/cli.ts
#!/usr/bin/env node
import { FastyclawServer } from './server';

const [, , cmd] = process.argv;
if (cmd === 'start') FastyclawServer.start();
else { console.error('usage: fastyclaw start'); process.exit(1); }
```

`FastyclawServer.start()`:
1. `await AgentSkills.loader.load()`
2. Build Express app, wire routes via `SubmoduleFastyclawServerRoutes`.
3. Listen on `Const.port` (default `5177`, override `FASTYCLAW_PORT`).
4. `console.log('fastyclaw listening on http://localhost:5177')` — and nothing else.

---

## Workflow

User runs `fastyclaw start`. Server boots, loads skills, opens port 5177. A consumer process does:

```ts
const client = new FastyclawClient();
await client.connect();
await client.setModel('gpt-4.1-mini');
for await (const ev of client.sendMessage('List files and summarize README')) {
  if (ev.type === 'text-delta') process.stdout.write(ev.delta);
}
```

Server creates a session, streams the user text into `AgentRuntime.loop.run`, which calls `streamText` with all `AgentTools.all(session)` and the skills-augmented system prompt. Each model step either emits text deltas (forwarded as `text-delta`) or calls a tool (forwarded as `tool-call` → executed → `tool-result`). The loop runs unbounded (`stepCountIs(MAX_SAFE_INTEGER)`) until the model returns a turn with no tool calls, at which point the server emits `done` and closes the SSE response.

---

## Out of scope (v1)

- Auth, multi-tenant, persistence (sessions are in-memory; lost on restart).
- Providers beyond OpenAI.
- Skill `load_skill` tool (v1 embeds all skill descriptions in system prompt).
- Plan mode, subagent spawning, memory files — none of the meta-tools.
- Interactive terminal UI for `fastyclaw start`.
