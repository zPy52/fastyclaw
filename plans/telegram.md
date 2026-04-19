# telegram

Expose the running fastyclaw server to a Telegram bot so a user can message the bot (privately or in a group) and have the agent loop respond — with the bot's token and on/off state configurable via both the CLI and the client SDK.

---

## Chat → thread mapping

Each Telegram `chat.id` (private or group) maps 1:1 to a persistent fastyclaw `Thread`. First inbound message from a chat creates the thread; subsequent messages reuse it. Group members share one thread — the agent treats the chat as a single conversation, prefixing each user message with `@username:` so the model can disambiguate speakers.

- **Private chats**: reply to every message.
- **Group chats**: only react when the bot is `@mentioned`, the message is a reply to a bot message, or the message starts with `/ask`. Otherwise ignore. This avoids pulling every group message into the loop.

Mapping is persisted to `~/.fastyclaw/telegram-chats.json`:

```ts
// { [chatId: string]: { threadId: string; title: string; kind: 'private'|'group'|'supergroup'|'channel' } }
```

---

## Dependency

Add `grammy@^1.30` — TS-first, actively maintained, polling + webhook support, minimal surface.

---

## Config schema

Extend `AppConfig` with an optional `telegram` block. Token lives in the same `~/.fastyclaw/config.json` — acceptable because the file is already gated at `0600`-equivalent behind `$HOME/.fastyclaw/`.

```ts
// src/server/types.ts
export interface TelegramConfig {
  token: string | null;
  enabled: boolean;                 // whether the poller should run
  allowedUserIds: number[];         // empty = allow anyone; otherwise whitelist
  groupTrigger: 'mention' | 'all';  // default 'mention'
}

export interface AppConfig {
  model: string;
  provider: Provider;
  cwd: string;
  telegram: TelegramConfig;
}
```

`AppConfigStore.patch()` gets a new `telegram?: Partial<TelegramConfig>` branch that shallow-merges into `config.telegram`. Defaults: `{ token: null, enabled: false, allowedUserIds: [], groupTrigger: 'mention' }`.

---

## Server module layout (modular-code)

```
src/telegram/
├── index.ts      # FastyclawTelegram (static)
├── types.ts
├── chats.ts      # SubmoduleFastyclawTelegramChats   (chatId ↔ threadId map, persisted JSON)
├── bot.ts        # SubmoduleFastyclawTelegramBot     (grammy Bot wrapper, lifecycle)
└── handler.ts    # SubmoduleFastyclawTelegramHandler (incoming msg → agent loop → reply edits)
```

```ts
// src/telegram/index.ts
export class FastyclawTelegram {
  public static readonly chats   = new SubmoduleFastyclawTelegramChats();
  public static readonly bot     = new SubmoduleFastyclawTelegramBot();
  public static readonly handler = new SubmoduleFastyclawTelegramHandler(
    FastyclawTelegram.bot,
    FastyclawTelegram.chats,
  );

  public static async applyConfig(cfg: TelegramConfig): Promise<void>;  // start/stop as needed
  public static async shutdown(): Promise<void>;                         // on SIGINT
}
```

### SubmoduleFastyclawTelegramBot

```ts
public async start(token: string): Promise<void>;   // new Bot(token); bot.start({ drop_pending_updates: true })
public async stop(): Promise<void>;                  // bot.stop()
public isRunning(): boolean;
public current(): Bot | null;
```

Uses grammy long-polling (`bot.start()`). Webhook support is out of scope for v1.

### SubmoduleFastyclawTelegramChats

```ts
public async load(): Promise<void>;                       // reads ~/.fastyclaw/telegram-chats.json
public async resolve(chatId: number, meta: ChatMeta): Promise<string>;  // returns threadId, creating a new Thread if unmapped
public async forget(chatId: number): Promise<void>;       // unmap (thread file is kept)
public list(): Array<{ chatId: number; threadId: string; title: string; kind: string }>;
```

`resolve()` calls `FastyclawServer.threads.create()` the first time a chat is seen, then persists the map.

### SubmoduleFastyclawTelegramHandler

Wires a single `bot.on('message')` handler:

```ts
bot.on('message:text', async (ctx) => {
  if (!this.shouldRespond(ctx)) return;                                 // trigger rules
  if (!this.isAllowed(ctx.from?.id)) return;                            // whitelist
  const threadId = await this.chats.resolve(ctx.chat.id, meta(ctx));
  const text = this.extractUserText(ctx);                               // strip @mention, prepend @username: in groups
  await this.runTurn(ctx, threadId, text);
});
```

`runTurn` drives the same `AgentRuntime.loop.run` used by HTTP, wired to a custom `Run.stream` adapter that:

1. Sends an initial placeholder message (`…`).
2. On each `text-delta`, accumulates into a buffer and edits the placeholder at most once per **800 ms** (Telegram rate-limits `editMessageText`).
3. On a `tool-call` event, appends a compact `🔧 {name}({…})` line to the same message (debug-visible).
4. On `done`, writes the final message with the full assistant text.
5. On `error`, edits the message to `⚠️ {message}`.

Reuse existing `FastyclawServer.threads` for load/save and `createRun` from `src/server/run.ts` — build a `Run` whose `stream` is a `TelegramStream` implementing the same `write`/`end`/`isClosed` surface as `SubmoduleFastyclawServerStream`.

---

## Config and lifecycle wiring

`FastyclawServer.start()` gains two lines after `AgentSkills.loader.load()`:

```ts
await FastyclawTelegram.chats.load();
await FastyclawTelegram.applyConfig(FastyclawServer.config.get().telegram);
```

`AppConfigStore.patch()` emits on every change. Easier: after `/config` or `/telegram/config` writes, the route calls `FastyclawTelegram.applyConfig(newCfg.telegram)`. `applyConfig` logic:

```ts
if (!cfg.token || !cfg.enabled)  return bot.stop();
if (bot.isRunning())             return;    // no restart if token unchanged
await bot.start(cfg.token);
```

Token change while running: `applyConfig` detects token mismatch and does `stop()` → `start(newToken)`.

`process.on('SIGINT' | 'SIGTERM', FastyclawTelegram.shutdown)` — ensures the grammy poller exits cleanly.

---

## HTTP routes

Mounted by `SubmoduleFastyclawServerRoutes`:

| Method | Path                       | Body / response                                                                  |
|--------|----------------------------|----------------------------------------------------------------------------------|
| GET    | `/telegram/config`         | → `TelegramConfig` (token masked: `sk…last4`).                                   |
| POST   | `/telegram/config`         | `{ token?, enabled?, allowedUserIds?, groupTrigger? }` → `{ ok, config }`.       |
| POST   | `/telegram/start`          | Sets `enabled=true`, calls `applyConfig`. 400 if no token.                       |
| POST   | `/telegram/stop`           | Sets `enabled=false`, stops the poller.                                          |
| GET    | `/telegram/status`         | `{ running: boolean; botUsername: string \| null; chatCount: number }`.          |
| GET    | `/telegram/chats`          | Returns `chats.list()`.                                                          |
| DELETE | `/telegram/chats/:chatId`  | Calls `chats.forget()`.                                                          |

All routes write through `AppConfigStore` so state survives restart.

---

## Client SDK

```ts
// client-sdk/src/telegram.ts
export class FastyclawClientTelegram {
  public constructor(private readonly baseUrl: string) {}
  public async getConfig(): Promise<TelegramConfig>;
  public async setToken(token: string): Promise<void>;                          // POST /telegram/config { token }
  public async setAllowedUsers(ids: number[]): Promise<void>;
  public async setGroupTrigger(mode: 'mention' | 'all'): Promise<void>;
  public async enable(): Promise<void>;                                          // POST /telegram/start
  public async disable(): Promise<void>;                                         // POST /telegram/stop
  public async status(): Promise<{ running: boolean; botUsername: string | null; chatCount: number }>;
  public async listChats(): Promise<Array<{ chatId: number; threadId: string; title: string; kind: string }>>;
  public async forgetChat(chatId: number): Promise<void>;
}

// client-sdk/src/client.ts — one new field
public readonly telegram = new FastyclawClientTelegram(this.baseUrl);
```

Re-export `TelegramConfig` from `client-sdk/src/types.ts` (mirror of server type).

---

## CLI

Extend `src/cli.ts`. Keep the current one-file, positional-args style (no `commander` dep for now):

```txt
fastyclaw start [port]
fastyclaw telegram status
fastyclaw telegram set-token <token>
fastyclaw telegram allow <userId> [, <userId> ...]
fastyclaw telegram trigger <mention|all>
fastyclaw telegram start
fastyclaw telegram stop
fastyclaw telegram chats
fastyclaw telegram forget <chatId>
```

Each `telegram <subcmd>` simply calls the HTTP endpoint on `http://localhost:${Const.DEFAULT_PORT}` using `fetch` — requires the server to be running. If the server is unreachable, print `fastyclaw server not running — run 'fastyclaw start' first.` and exit non-zero.

---

## Workflow

1. User runs `fastyclaw start`. Server boots; `FastyclawTelegram.applyConfig` sees `token: null`, does nothing.
2. User runs `fastyclaw telegram set-token 123:ABC` then `fastyclaw telegram start`. The `POST /telegram/config` + `POST /telegram/start` write config, then `applyConfig` calls `bot.start('123:ABC')`. Poller begins.
3. Someone messages the bot in Telegram. `bot.on('message:text')` fires → `chats.resolve` returns (or creates) a `threadId` → a `Run` is built against that thread with a `TelegramStream` → `AgentRuntime.loop.run` streams back through message edits.
4. Turn ends; `Thread` is persisted by the same `onMessages` callback the HTTP route uses. Next message in the same chat continues the same thread.
5. `fastyclaw telegram stop` or a client call to `client.telegram.disable()` flips `enabled=false` and stops polling; chat map stays intact so re-enabling resumes seamlessly.

---

## Out of scope (v1)

- Webhook mode (long-polling only).
- Non-text messages: photos, voice, documents. Handler replies `unsupported message type` and ignores.
- Inline mode / slash commands beyond `/ask` as a group trigger.
- Per-chat model or cwd overrides — the bot uses whatever `AppConfig` currently holds.
- Multiple bots / multi-token. One token at a time.
- Encryption of the token on disk; it lives in `config.json` like every other field.
