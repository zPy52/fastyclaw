# automations

Persistent, server-side scheduling so the running `fastyclaw` daemon can fire prompts back into itself on a cron, an interval, or once at a specific time. The agent gets a `schedule_automation` tool so users can ask in natural language ("every day at 5am hit this API and run this skill"). All triggers route through the daemon — the same path whether the user clicks "run now", a cron tick fires, or any client (CLI, channel, HTTP) calls the API.

Modeled on Claude Code Desktop scheduled tasks ([docs](https://code.claude.com/docs/en/desktop-scheduled-tasks)) and Codex Automations ([docs](https://developers.openai.com/codex/app/automations)): a single in-process scheduler, JSON-on-disk persistence, fresh-thread or attached-thread firing, and natural-language CRUD via tools (`CronCreate` / `CronList` / `CronDelete` style).

---

## Storage

```txt
~/.fastyclaw/
├── automations.json          # full registry — array of Automation
└── automations/
    └── <id>/
        ├── runs.jsonl        # append-only log: { startedAt, finishedAt, threadId, status, error? }
        └── prompt.md         # optional override; if present, supersedes Automation.prompt
```

Single JSON file, not SQLite — same convention as `telegram-chats.json`, `slack-chats.json`, etc. Atomic write via temp + rename.

---

## Data model

```ts
// src/server/automations/types.ts
export type Trigger =
  | { kind: 'cron'; expr: string }            // 5-field, vixie-cron semantics; local timezone
  | { kind: 'interval'; everyMs: number }     // min 60_000
  | { kind: 'once'; at: string };             // ISO8601, local timezone

export type Mode =
  | { kind: 'fresh' }                         // new thread per fire (default)
  | { kind: 'attach'; threadId: string };     // re-enters an existing thread (Codex "thread automation")

export interface Automation {
  id: string;                                 // 8-char nanoid
  name: string;                               // unique, kebab-case
  description: string;
  prompt: string;                             // body used as the user message; overridden by automations/<id>/prompt.md if present
  trigger: Trigger;
  mode: Mode;
  cwd?: string;                               // overrides AppConfig.cwd for that run
  model?: string;                             // overrides AppConfig.model
  enabled: boolean;
  createdAt: string;                          // ISO
  createdBy: 'agent' | 'http' | 'cli';
  lastFiredAt?: string;
  lastError?: string;
}

export interface AutomationRun {
  startedAt: string;
  finishedAt?: string;
  threadId: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  reason?: 'busy' | 'disabled' | 'expired';   // only for 'skipped'
}
```

Recurring `cron` and `interval` triggers do **not** auto-expire (unlike Claude Code's 7-day session-scoped expiry). `once` triggers self-disable after a successful or failed fire — the row stays for history.

---

## Module layout (modular-code)

```txt
src/server/automations/
├── index.ts                # FastyclawAutomations (static)
├── types.ts
├── store.ts                # SubmoduleFastyclawAutomationsStore       (JSON read/write, runs.jsonl append)
├── scheduler.ts            # SubmoduleFastyclawAutomationsScheduler   (the cron loop)
└── runner.ts               # SubmoduleFastyclawAutomationsRunner      (fires one Automation → AgentRuntime.loop.run)
```

```ts
// src/server/automations/index.ts
export class FastyclawAutomations {
  public static readonly store     = new SubmoduleFastyclawAutomationsStore();
  public static readonly runner    = new SubmoduleFastyclawAutomationsRunner(FastyclawAutomations.store);
  public static readonly scheduler = new SubmoduleFastyclawAutomationsScheduler(
    FastyclawAutomations.store,
    FastyclawAutomations.runner,
  );
}
```

`FastyclawServer.start()` calls `await FastyclawAutomations.store.load()` and `FastyclawAutomations.scheduler.start()` after loading channels; shutdown calls `scheduler.stop()`.

---

## Scheduler loop

Single in-process timer at 1s tick, mirrors Claude Code's "checks every second, fires between turns, low priority" model. Use `cron-parser` (add to `dependencies`) to compute next-fire times — no `node-cron`, no daemon spawn.

```ts
// src/server/automations/scheduler.ts
import CronParser from 'cron-parser';
import type { Automation } from './types';
import type { SubmoduleFastyclawAutomationsStore } from './store';
import type { SubmoduleFastyclawAutomationsRunner } from './runner';

export class SubmoduleFastyclawAutomationsScheduler {
  private timer?: NodeJS.Timeout;
  private nextFire = new Map<string, number>();          // id → epoch ms

  public constructor(
    private readonly store: SubmoduleFastyclawAutomationsStore,
    private readonly runner: SubmoduleFastyclawAutomationsRunner,
  ) {}

  public start(): void {
    this.recompute();                                    // populate nextFire on boot, skipping stale once-triggers
    this.timer = setInterval(() => this.tick(), 1_000);
  }

  public stop(): void { if (this.timer) clearInterval(this.timer); }

  public recompute(automation?: Automation): void { /* set nextFire[id] = next match (with jitter) */ }

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const a of this.store.list()) {
      if (!a.enabled) continue;
      const due = this.nextFire.get(a.id);
      if (!due || due > now) continue;
      this.nextFire.delete(a.id);
      void this.runner.fire(a).finally(() => this.recompute(a));   // re-arm after fire (or disable for 'once')
    }
  }
}
```

Jitter (deterministic from `id`): up to 10% of period for `cron`/`interval`, capped at 15min. Same rule as Claude Code so multiple automations don't all hit the API at `:00`.

---

## Runner — bridging back into the agent

```ts
// src/server/automations/runner.ts
export class SubmoduleFastyclawAutomationsRunner {
  public async fire(a: Automation): Promise<void> {
    // 1. Resolve thread: 'fresh' → FastyclawServer.threads.create();
    //    'attach'      → FastyclawServer.threads.load(a.mode.threadId) (skip+log if missing).
    // 2. Snapshot config; override .cwd / .model from automation if set.
    // 3. Build a Run with a NullStream (no SSE consumer) — text-deltas/tool-calls drop on the floor;
    //    tool-results are still appended to thread.messages by AgentRuntime.loop.
    // 4. Append run row to runs.jsonl with status: 'running'.
    // 5. await AgentRuntime.loop.run(run, prompt, persistMessages).
    // 6. Patch run row → 'completed' | 'failed' (with error.message).
    // 7. If trigger.kind === 'once' → store.patch(a.id, { enabled: false }).
  }
}
```

The `NullStream` satisfies the `SubmoduleFastyclawServerStream` interface but writes nowhere — automations are not interactive. A future "attach to a live SSE viewer" is out of scope.

If a fire is due while the agent is mid-turn for that same `attach` thread, skip with `status: 'skipped', reason: 'busy'` (matches Claude Code's "fires between turns" guarantee).

---

## Agent tools

Three new tools wired into `AgentTools.all(run)`:

```ts
// src/agent/tools/schedule-automation.ts
export function scheduleAutomation(run: Run) {
  return tool({
    description:
      'Schedule a future or recurring prompt back to this agent. Use when the user asks for a routine ' +
      '("every morning at 5am call this API and run the report skill", "remind me in 2 hours to check CI"). ' +
      'The scheduled prompt fires in a fresh thread by default; pass mode={kind:"attach",threadId} to keep ' +
      'the conversation continuing in this thread.',
    inputSchema: z.object({
      name: z.string().regex(/^[a-z0-9-]+$/),
      description: z.string(),
      prompt: z.string().describe('The user-style message that will be sent to the agent when the trigger fires.'),
      trigger: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('cron'),     expr: z.string() }),
        z.object({ kind: z.literal('interval'), everyMs: z.number().int().min(60_000) }),
        z.object({ kind: z.literal('once'),     at: z.string() }),
      ]),
      mode: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('fresh') }),
        z.object({ kind: z.literal('attach'), threadId: z.string() }),
      ]).optional().default({ kind: 'fresh' }),
      cwd: z.string().optional(),
      model: z.string().optional(),
    }),
    execute: async (input) => FastyclawAutomations.store.create({ ...input, enabled: true, createdBy: 'agent' }),
  });
}
```

```ts
// src/agent/tools/list-automations.ts   → returns Automation[] (without prompt body, just name/description/trigger/lastFiredAt)
// src/agent/tools/cancel-automation.ts  → input { id }; calls store.delete(id)
```

Add to `AgentTools.all`:

```ts
schedule_automation: scheduleAutomation(run),
list_automations:    listAutomations(run),
cancel_automation:   cancelAutomation(run),
```

System-prompt mention: `SubmoduleAgentRuntimePrompt` appends a one-liner — *"You can schedule prompts to yourself with `schedule_automation` (cron / interval / once)."* — so the model knows the tool exists without requiring a skill load.

---

## HTTP routes

Mounted in `SubmoduleFastyclawServerRoutes.mount`:

```txt
GET    /automations                  → Automation[]
POST   /automations                  → body: Omit<Automation, 'id'|'createdAt'|'createdBy'|'enabled'> & { enabled?: boolean }
GET    /automations/:id              → Automation + last 50 runs
PATCH  /automations/:id              → partial Automation (mainly enabled, prompt, trigger)
DELETE /automations/:id              → { ok: true }
POST   /automations/:id/run          → fire-now; returns { runId, threadId }; same path as a scheduled fire
```

All routes go through the existing `bearerAuth` middleware — authenticated clients only.

External cron jobs use `POST /automations/:id/run` rather than `POST /messages`, so the daemon owns thread lifecycle and run-history logging in one place.

---

## Client SDK

```ts
// client-sdk/src/automations.ts
export class FastyclawClientAutomations {
  public constructor(private readonly client: FastyclawClient) {}
  public async list(): Promise<Automation[]>;
  public async get(id: string): Promise<{ automation: Automation; runs: AutomationRun[] }>;
  public async create(input: CreateAutomationInput): Promise<Automation>;
  public async patch(id: string, patch: Partial<Automation>): Promise<Automation>;
  public async delete(id: string): Promise<void>;
  public async runNow(id: string): Promise<{ runId: string; threadId: string }>;
}
```

Re-export from `client-sdk/src/index.ts` and add `Automation`, `AutomationRun`, `Trigger`, `Mode` to the type exports.

---

## CLI

```txt
fastyclaw automations list
fastyclaw automations show <id>
fastyclaw automations create   --name <n> --prompt <p> --cron <expr>      [--cwd <dir>] [--model <m>]
fastyclaw automations create   --name <n> --prompt <p> --every <ms>
fastyclaw automations create   --name <n> --prompt <p> --at <iso>
fastyclaw automations enable <id>
fastyclaw automations disable <id>
fastyclaw automations delete <id>
fastyclaw automations run <id>
```

All commands hit the local server via `state.json`, mirroring `fastyclaw telegram *`.

---

## Workflow

User in Telegram: *"every weekday at 5am, fetch https://example.com/leads.json and append new leads to leads.csv using the csv skill."* The Telegram handler runs `AgentRuntime.loop.run`. The agent calls `schedule_automation` with `trigger: { kind: 'cron', expr: '0 5 * * 1-5' }`, `mode: { kind: 'fresh' }`, and a `prompt` like *"Fetch …, append to leads.csv via csv skill, post a one-line summary."* `FastyclawAutomations.store.create` writes the entry to `automations.json`, `scheduler.recompute(a)` arms `nextFire`, and the tool returns the new `id` to the model, which confirms in chat.

At 05:00 + jitter on the next weekday, `scheduler.tick` finds the due automation and calls `runner.fire(a)`. `runner` creates a fresh `Thread`, builds a `Run` with a `NullStream`, and calls `AgentRuntime.loop.run(run, a.prompt, …)` — the same loop used by HTTP `/messages` and every channel handler. The agent uses `web_fetch`, the loaded `csv` skill, `edit_file`, etc., and the run row is patched to `completed` in `runs.jsonl`.

A separate user later asks via Slack: *"what scheduled jobs are running?"* — the agent calls `list_automations`, formats the result, replies. *"cancel the leads one"* → `cancel_automation`. The same automations are visible from `fastyclaw automations list` and from `GET /automations` over HTTP, because there is one source of truth: `FastyclawAutomations.store`.

External cron (e.g. a system `crontab` calling `curl -H "Authorization: Bearer …" -X POST http://localhost:5177/automations/<id>/run`) uses the exact same `runner.fire` path. The user can flip a recurring automation to `enabled: false` and drive it entirely from a system cron without changing anything else.

---

## Out of scope (v1)

- Distributed / multi-host scheduling (single in-process timer, single daemon).
- Auto-catch-up for missed fires while daemon was down (Claude Code Desktop does one catch-up per task; we skip and log `reason: 'expired'`).
- Webhook / GitHub-event triggers (Routines-style) — only cron/interval/once.
- Streaming a live automation run into an SSE viewer; runs are headless. A future `GET /automations/:id/runs/:runId/stream` can attach a real `Stream` instead of `NullStream`.
- Per-automation MCP / skill allowlists; runs inherit the global config.
- TZ override per automation; uses the daemon's local TZ.
