# Automations

Automations let you schedule the agent to run a prompt on a cron expression, a fixed interval, or a one-time timestamp — all without keeping a terminal open.

## Concepts

- **Trigger** — when the automation fires: `cron`, `interval`, or `once`.
- **Mode** — whether each run starts a fresh thread (`fresh`) or appends to an existing one (`attach`).
- **Run** — one execution of the automation. Each run gets its own `runId` and references the thread it ran in.

## Creating automations

### Terminal (CLI)

```bash
# Cron — every day at 9 AM
fastyclaw automation create \
  --name "daily-digest" \
  --prompt "Summarise the git log from the last 24 hours." \
  --cron "0 9 * * *"

# Interval — every 30 minutes
fastyclaw automation create \
  --name "health-check" \
  --prompt "Run curl http://localhost:3000/health and report the status." \
  --every 30m

# One-shot — at a specific ISO timestamp
fastyclaw automation create \
  --name "release-reminder" \
  --prompt "Remind me to tag the release." \
  --at "2026-05-01T10:00:00Z"
```

### HTTP

```bash
# Cron
curl -s -X POST http://127.0.0.1:5177/automations \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "daily-digest",
    "description": "Morning git summary",
    "prompt": "Summarise the git log from the last 24 hours.",
    "trigger": { "kind": "cron", "expr": "0 9 * * *" }
  }'

# Interval (ms)
curl -s -X POST http://127.0.0.1:5177/automations \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "health-check",
    "prompt": "Check http://localhost:3000/health and report.",
    "trigger": { "kind": "interval", "everyMs": 1800000 }
  }'

# One-shot
curl -s -X POST http://127.0.0.1:5177/automations \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "release-reminder",
    "prompt": "Tag the release.",
    "trigger": { "kind": "once", "at": "2026-05-01T10:00:00Z" }
  }'
```

### Client SDK

```ts
import { FastyclawClient } from 'fastyclaw-sdk';

const client = new FastyclawClient();

const automation = await client.automations.create({
  name: 'daily-digest',
  description: 'Morning git summary',
  prompt: 'Summarise the git log from the last 24 hours.',
  trigger: { kind: 'cron', expr: '0 9 * * *' },
});

console.log('Created:', automation.id);
```

## Listing and inspecting

### Terminal

```bash
fastyclaw automation list
fastyclaw automation show <id>
fastyclaw automation runs <id>
```

### HTTP

```bash
curl -s http://127.0.0.1:5177/automations
curl -s http://127.0.0.1:5177/automations/<id>
```

### Client SDK

```ts
const list = await client.automations.list();

const { automation, runs } = await client.automations.get(id);
console.log(runs.map(r => `${r.runId} ${r.status} ${r.startedAt}`));
```

## Enabling and disabling

Automations are enabled by default. Disable one to pause it without deleting it:

### Terminal

```bash
fastyclaw automation disable <id>
fastyclaw automation enable <id>
```

### HTTP

```bash
curl -s -X PATCH http://127.0.0.1:5177/automations/<id> \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'
```

### Client SDK

```ts
await client.automations.patch(id, { enabled: false });
await client.automations.patch(id, { enabled: true });
```

## Running immediately

Trigger an automation right now, regardless of its schedule:

### Terminal

```bash
fastyclaw automation run <id>
```

### HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/automations/<id>/run
```

### Client SDK

```ts
const { runId, threadId } = await client.automations.runNow(id);
console.log('Run started:', runId, 'in thread:', threadId);
```

## Deleting

### Terminal

```bash
fastyclaw automation delete <id>
```

### HTTP

```bash
curl -s -X DELETE http://127.0.0.1:5177/automations/<id>
```

### Client SDK

```ts
await client.automations.delete(id);
```

## Thread modes

By default each automation run starts a fresh thread so runs don't bleed into each other. You can attach runs to an existing thread instead — useful when you want a rolling log of work in one place:

```ts
await client.automations.create({
  name: 'rolling-log',
  prompt: 'Append a one-line status update.',
  trigger: { kind: 'interval', everyMs: 3600000 },
  mode: { kind: 'attach', threadId: 'existing-thread-uuid' },
});
```

## Per-automation model and cwd

Each automation can override the global model and working directory:

```ts
await client.automations.create({
  name: 'code-review',
  prompt: 'Review staged changes and leave comments.',
  trigger: { kind: 'cron', expr: '30 16 * * 1-5' },
  model: 'claude-sonnet-4-5',
  cwd: '/Users/me/projects/my-app',
});
```

## Agent-created automations

The agent itself can schedule automations using the `schedule_automation`, `list_automations`, and `cancel_automation` tools. Just ask it:

> "Schedule a daily run at 8 AM that checks if my API is responding and sends me a Telegram message if it isn't."

The agent will call `schedule_automation` and the automation will appear in `fastyclaw automation list`.

## Storage

Automations are stored in two places:

- `~/.fastyclaw/automations.json` — the list of automation definitions
- `~/.fastyclaw/automations/<id>/` — per-automation run logs

These files are plain JSON and can be backed up or edited directly (restart the server after manual edits).
