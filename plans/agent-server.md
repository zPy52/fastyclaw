# agent-server

`fastyclaw start` should detach a long-running server into the background, print an instant header, and let many independently-named agents coexist on one machine — each with its own folder, port, and lifecycle commands.

---

## Per-agent directory layout

Every agent gets a self-contained folder under `~/.fastyclaw/agents/<name>/`. `<name>` defaults to `fastyclaw`.

```txt
~/.fastyclaw/
└── agents/
    └── <name>/
        ├── config.json          # was ~/.fastyclaw/config.json
        ├── AGENTS.md            # per-agent rules (read by get_rules tool)
        ├── threads/             # was ~/.fastyclaw/threads/
        ├── telegram-chats.json
        ├── whatsapp-auth/
        ├── whatsapp-chats.json
        ├── slack-chats.json
        ├── discord-chats.json
        ├── browser-profile/
        ├── agent.pid            # daemon PID (single line, integer)
        ├── agent.log            # stdout (rotated only manually)
        ├── agent.err            # stderr
        └── state.json           # { name, pid, port, host, startedAt, version }
```

The legacy `~/.fastyclaw/config.json` and `~/.fastyclaw/threads/` are **not migrated** — first run of the new build with default name creates fresh files at `~/.fastyclaw/agents/fastyclaw/`. Out of scope: auto-migration.

---

## `Const` becomes per-agent

Currently `src/config/index.ts` exports static paths derived from `~/.fastyclaw`. Replace with a single bindable context resolved once at boot from env (`FASTYCLAW_AGENT_NAME`, `FASTYCLAW_AGENT_DIR`).

```ts
// src/config/index.ts
export class Const {
  public static name: string;            // e.g. "fastyclaw" or "agent1"
  public static agentDir: string;        // ~/.fastyclaw/agents/<name>
  public static configPath: string;      // <agentDir>/config.json
  public static agentsMdPath: string;    // <agentDir>/AGENTS.md
  public static threadsDir: string;      // <agentDir>/threads
  public static telegramChatsPath: string;
  public static whatsappAuthDir: string;
  public static whatsappChatsPath: string;
  public static slackChatsPath: string;
  public static discordChatsPath: string;
  public static browserProfileDir: string;
  public static pidPath: string;         // <agentDir>/agent.pid
  public static logPath: string;         // <agentDir>/agent.log
  public static errPath: string;         // <agentDir>/agent.err
  public static statePath: string;       // <agentDir>/state.json

  public static port: number;            // resolved at boot
  public static host: string = process.env.FASTYCLAW_HOST ?? '127.0.0.1';
  public static baseUrl(): string;       // http://<host>:<port>

  public static defaultModel: string = 'gpt-5.4-mini';
  public static defaultProviderId: ProviderId = 'openai';

  public static bind(name: string): void;     // populate all path fields
  public static setPort(port: number): void;
}
```

`Const.bind()` runs at the very top of both the CLI parent (so it can locate the right `state.json` for stop/list/status) and the daemon child (for actual file I/O). Read order: `--name`/positional > `FASTYCLAW_AGENT_NAME` env > `"fastyclaw"`.

`Const.baseUrl()` was a string — has to become a method now since the port isn't known at module-load time. CLI clients that hit the local server look up `<agentDir>/state.json` to read the actual port (an explicit agent already started may be on a non-default port).

---

## CLI structure

Keep the existing hand-rolled `argv` parser — no new dep. Reorganize around a single dispatcher that recognizes the new `start` / `server` shape.

```txt
fastyclaw start [name] [--name|-n <name>] [--port|-p <port>]
fastyclaw server start [name] [-n <name>] [-p <port>]   # alias of `start`
fastyclaw server stop  [name]
fastyclaw server list
fastyclaw server status [name]
fastyclaw server logs   [name] [--err]
```

Argument resolution helper (used by every server-scoped command):

```ts
// src/cli/args.ts
export interface AgentArgs { name: string; port?: number; }

export function parseAgentArgs(rest: string[]): AgentArgs {
  let name: string | undefined;
  let port: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === '--name' || t === '-n') { name = rest[++i]; continue; }
    if (t === '--port' || t === '-p') { port = Number(rest[++i]); continue; }
    if (t.startsWith('-')) { fail(`unknown flag: ${t}`); }
    if (name === undefined) { name = t; continue; }
    fail(`unexpected positional: ${t}`);
  }
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) fail(`invalid port`);
  if (name !== undefined && !/^[a-zA-Z0-9._-]+$/.test(name)) fail(`invalid agent name`);
  return { name: name ?? 'fastyclaw', port };
}
```

Dispatcher:

```ts
// src/cli.ts (top-level switch)
if (cmd === 'start')                                     handleStart(argv.slice(1));
else if (cmd === 'server' && argv[1] === 'start')        handleStart(argv.slice(2));
else if (cmd === 'server' && argv[1] === 'stop')         handleServerStop(argv.slice(2));
else if (cmd === 'server' && argv[1] === 'list')         handleServerList();
else if (cmd === 'server' && argv[1] === 'status')       handleServerStatus(argv.slice(2));
else if (cmd === 'server' && argv[1] === 'logs')         handleServerLogs(argv.slice(2));
// existing branches (provider, auth, telegram, …) unchanged
```

`fastyclaw start` and `fastyclaw server start` route through the **same** `handleStart` function — they are not aliases at the command level, they're literally the same handler.

All existing client-facing commands (`provider`, `auth`, `telegram`, `whatsapp`, `slack`, `discord`, `call-option`) gain an optional `--name`/`-n` flag so they can target a specific agent's HTTP API. Default is `fastyclaw`. Resolution: read `<agentDir>/state.json` to get `{ port, host }`, then fetch — replaces the current hardcoded `Const.baseUrl`.

---

## Daemonization — cross-platform

One approach for macOS, Linux, and Windows: `child_process.spawn` with `detached: true` and `stdio` redirected to log file descriptors, then `unref()`.

```ts
// src/server/daemon.ts
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export function spawnDaemon(args: { name: string; port?: number }): { pid: number } {
  fs.mkdirSync(Const.agentDir, { recursive: true });
  const out = fs.openSync(Const.logPath, 'a');
  const err = fs.openSync(Const.errPath, 'a');

  const child = spawn(process.execPath, [process.argv[1], '__run-daemon'], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      FASTYCLAW_AGENT_NAME: args.name,
      FASTYCLAW_AGENT_DIR: Const.agentDir,
      FASTYCLAW_PORT: args.port ? String(args.port) : '',
      FASTYCLAW_DAEMON: '1',
    },
  });
  child.unref();
  return { pid: child.pid! };
}
```

Justification:
- `detached: true` on POSIX puts the child in its own process group → it survives the parent terminal closing. On Windows it spawns without a console window (combined with `windowsHide: true`).
- `unref()` removes the child from the parent's event loop → parent exits immediately after printing.
- `stdio: ['ignore', out, err]` decouples the child from the parent's stdio. No pipes left open, no SIGPIPE on terminal close.
- `process.execPath` + `process.argv[1]` (the resolved `dist/cli.js`) re-invokes the same binary that the user ran — works whether installed globally, via `npx`, or local `node dist/cli.js`. No reliance on `nohup`, `start /B`, `forever`, or `pm2`.
- `__run-daemon` is an internal subcommand (not in `usage()`) that just calls `FastyclawServer.start()` and installs signal handlers.

---

## `handleStart` flow

```ts
async function handleStart(rest: string[]): Promise<void> {
  const { name, port } = parseAgentArgs(rest);
  Const.bind(name);

  // 1. instant header — printed BEFORE any I/O that could block
  printHeader(`starting agent "${name}"${port ? ` on port ${port}` : ''}`);

  // 2. fail fast on collision
  const existing = readState();          // returns null if no state.json or pid is dead
  if (existing) fail(`agent "${name}" is already running (pid ${existing.pid}, port ${existing.port})`);

  // 3. resolve port: explicit honored as-is; otherwise auto-pick starting at 5177
  const resolvedPort = port ?? await pickFreePort(5177);

  // 4. daemonize
  const { pid } = spawnDaemon({ name, port: resolvedPort });

  // 5. wait for daemon to write state.json (max ~3s) and confirm
  const state = await waitForState(2_500);
  if (!state) fail(`daemon did not start in time — see ${Const.errPath}`);

  console.log(`fastyclaw "${name}" running on http://${state.host}:${state.port} (pid ${state.pid})`);
  console.log(`  dir:  ${Const.agentDir}`);
  console.log(`  logs: ${Const.logPath}`);
}
```

Header must print **before** `readState()` and `pickFreePort()` so the terminal flashes feedback even if those briefly stall. `printHeader` is a single `console.log` — no boxen, no chalk dependency, just a plain ASCII line.

`pickFreePort(start)` reuses the existing `findAvailablePort` logic in `src/server/index.ts:13`. It moves to `src/server/daemon.ts` and is shared.

`waitForState(timeoutMs)` polls `state.json` every 50ms until it appears or timeout — the daemon writes it after `app.listen` resolves.

`readState()` returns `null` when:
- `state.json` is missing, OR
- `state.json` exists but `process.kill(pid, 0)` throws `ESRCH` (stale pidfile from a crashed run). On stale, delete `state.json` and `agent.pid` and proceed.

---

## Daemon-side bootstrap

`FastyclawServer.start(port?)` becomes the daemon entrypoint. New steps:

```ts
public static async start(port?: number): Promise<void> {
  // Const is already bound from FASTYCLAW_AGENT_NAME by the time we land here.
  fs.mkdirSync(Const.agentDir, { recursive: true });
  fs.writeFileSync(Const.pidPath, String(process.pid), { mode: 0o600 });

  // ... existing init: AppConfigStore, routes, AgentSkills, telegram/whatsapp/slack/discord ...

  const resolvedPort = await findAvailablePort(port ?? Number(process.env.FASTYCLAW_PORT) || 5177);
  await new Promise<void>((resolve) => app.listen(resolvedPort, Const.host, resolve));
  Const.setPort(resolvedPort);

  fs.writeFileSync(Const.statePath, JSON.stringify({
    name: Const.name, pid: process.pid, port: resolvedPort,
    host: Const.host, startedAt: new Date().toISOString(),
    version: pkg.version,
  }, null, 2));

  installShutdown();   // SIGINT, SIGTERM, also POST /__shutdown route
}
```

Add a single auth-gated POST route `/__shutdown` that calls the same `shutdown()` closure. This is what `server stop` hits cross-platform — see below. The route lives next to existing routes in `src/server/routes.ts`.

`installShutdown` writes nothing to `state.json` on the way out — it deletes `state.json` and `agent.pid` after services close.

---

## `server stop` — graceful, cross-platform

Two-tier strategy that avoids forcing `taskkill` on Windows:

```ts
async function handleServerStop(rest: string[]): Promise<void> {
  const { name } = parseAgentArgs(rest);
  Const.bind(name);
  const state = readState();
  if (!state) { console.log(`agent "${name}" is not running`); return; }

  // Tier 1 — POST /__shutdown (graceful, app-level cleanup)
  try {
    await fetch(`http://${state.host}:${state.port}/__shutdown`, {
      method: 'POST',
      headers: authHeader(),
      signal: AbortSignal.timeout(2_000),
    });
  } catch { /* fall through */ }

  // Tier 2 — SIGTERM if still alive after 3s
  if (await waitForExit(state.pid, 3_000)) { console.log(`stopped "${name}"`); return; }
  try { process.kill(state.pid, 'SIGTERM'); } catch { /* already gone */ }

  // Tier 3 — last resort SIGKILL after another 3s
  if (await waitForExit(state.pid, 3_000)) { console.log(`stopped "${name}"`); return; }
  try { process.kill(state.pid, 'SIGKILL'); } catch { /* ignore */ }
  console.log(`force-killed "${name}"`);
}
```

`process.kill` on Windows maps to `TerminateProcess` (forceful), which is why tier 1 (HTTP) is the preferred path on Windows — the daemon does its own graceful shutdown. Tier 2/3 are the fallback if the HTTP route is unreachable. POSIX gets the normal SIGTERM → SIGKILL ladder.

`waitForExit(pid, ms)` polls `process.kill(pid, 0)` every 100ms; resolves `true` on `ESRCH`.

---

## `server list` / `status` / `logs`

```ts
// list — scan ~/.fastyclaw/agents/*/state.json
async function handleServerList(): Promise<void> {
  const dir = path.join(os.homedir(), '.fastyclaw', 'agents');
  const names = await fs.readdir(dir).catch(() => []);
  const rows = await Promise.all(names.map(readStateFor));
  // print: NAME  PID  PORT  STARTED  STATUS
}

// status — one agent
async function handleServerStatus(rest: string[]): Promise<void> {
  const { name } = parseAgentArgs(rest);
  Const.bind(name);
  const state = readState();
  console.log(JSON.stringify(state ?? { name, status: 'stopped' }, null, 2));
}

// logs — tail agent.log (or agent.err with --err)
async function handleServerLogs(rest: string[]): Promise<void> {
  const useErr = rest.includes('--err');
  const { name } = parseAgentArgs(rest.filter((t) => t !== '--err'));
  Const.bind(name);
  const file = useErr ? Const.errPath : Const.logPath;
  // stream to stdout; if --follow added later, watch via fs.watch
  process.stdout.write(await fs.readFile(file, 'utf8'));
}
```

`server list` is the only command that does **not** require an agent name; it walks `~/.fastyclaw/agents/`.

---

## Workflow

User runs `fastyclaw start agent1 -p 4132`. The CLI parent:
1. Parses args → `{ name: 'agent1', port: 4132 }`. Calls `Const.bind('agent1')`.
2. Prints the header line immediately.
3. Reads `state.json` at `~/.fastyclaw/agents/agent1/state.json`. If a live PID is found, exits with a "already running" error.
4. Spawns `node dist/cli.js __run-daemon` with `detached: true`, `unref()`, and stdio redirected to `agent.log` / `agent.err`. Sets `FASTYCLAW_AGENT_NAME=agent1` and `FASTYCLAW_PORT=4132` in the child env.
5. Polls for `state.json` to appear (≤ 2.5s) and prints the final "running on http://…" line.
6. Exits — terminal returns to the prompt.

The daemon child re-enters `cli.ts`, sees `__run-daemon`, calls `Const.bind(process.env.FASTYCLAW_AGENT_NAME)`, then `FastyclawServer.start(port)` which mkdir's the agent folder, writes `agent.pid`, boots Express + telegram/whatsapp/slack/discord, and writes `state.json`. It traps SIGINT/SIGTERM and exposes `/__shutdown` for graceful stop. On exit it deletes `state.json` and `agent.pid`.

A second invocation `fastyclaw start agent2 -p 4133` repeats the dance against `~/.fastyclaw/agents/agent2/`. Both daemons run concurrently with isolated config, AGENTS.md, threads, and chat state.

`fastyclaw server stop agent1` reads `state.json`, POSTs `/__shutdown`, falls back to SIGTERM/SIGKILL with timeouts, and reports the result.

---

## Files to touch

| File | Change |
|---|---|
| `src/config/index.ts` | Make `Const` mutable + `bind(name)`; add per-agent paths (`pidPath`, `logPath`, `errPath`, `statePath`, `agentsMdPath`); root moves under `<agentDir>` |
| `src/cli.ts` | Add `start`/`server` dispatch; add `--name`/`-n`/positional/`--port`/`-p` parsing; thread `--name` into existing client commands |
| `src/cli/args.ts` | New — `parseAgentArgs`, `printHeader`, `fail` |
| `src/server/daemon.ts` | New — `spawnDaemon`, `pickFreePort`, `readState`, `waitForState`, `waitForExit` |
| `src/server/index.ts` | Write `agent.pid` + `state.json`; expose `__shutdown` route; cleanup on exit; remove the now-shared `findAvailablePort` |
| `src/server/routes.ts` | Mount `POST /__shutdown` (auth-gated, calls injected shutdown closure) |
| `src/server/threads.ts`, `src/{telegram,whatsapp,slack,discord}/chats.ts`, `src/agent/sessions/browser.ts`, `src/whatsapp/sock.ts` | No code change needed — they read `Const.*` which is now per-agent automatically |

---

## Out of scope

- Auto-migration of legacy `~/.fastyclaw/{config.json,threads,*-chats.json}` into `agents/fastyclaw/`.
- `server logs --follow` (tail -f). v1 prints whole file.
- `server restart` shorthand. Compose `stop` + `start` for now.
- Auto-restart on crash / supervision (no respawn loop, no launchd/systemd integration).
- Locking against two concurrent `fastyclaw start <same-name>` racing past the pidfile check — relies on the small window between `readState()` and daemon writing `state.json`. Acceptable for v1.
