# slack

Expose the running fastyclaw server to a Slack workspace so a user can DM the bot, @mention it in a channel, or reply in a thread, and have the agent loop respond — with tokens and on/off state configurable via CLI and client SDK. Mirrors [plans/telegram.md](./telegram.md) for lifecycle/token auth and [plans/whatsapp.md](./whatsapp.md) for `send_files` streaming.

---

## Chat → thread mapping

Each Slack `channel.id` maps 1:1 to a persistent fastyclaw `Thread`. First inbound event from a channel creates the thread; subsequent messages reuse it. DMs, MPIMs, public and private channels all share this rule. Threaded replies on Slack's side reuse the same fastyclaw thread — we do **not** split one fastyclaw `Thread` per Slack `thread_ts`; we just reply with the right `thread_ts` so the conversation looks threaded in Slack.

- **DMs** (`channel_type === 'im'`, id starts with `D`): reply to every message.
- **MPIMs / channels / groups**: respond only when the event is `app_mention`, the message is a reply in a thread the bot already posted into (`thread_ts` of the message matches a prior bot `ts` in that channel), or the text starts with `/ask`. Otherwise ignore. Override with `channelTrigger: 'all'`.
- **Ignore**: any `event.subtype` (bot_message, message_changed, message_deleted, channel_join, etc.), `event.bot_id === ownBotId`, and non-text events.

Mapping persisted to `~/.fastyclaw/slack-chats.json`:

```ts
// { [channelId: string]: { threadId: string; title: string; kind: 'im' | 'mpim' | 'channel' | 'group' } }
```

Per-channel set of bot-posted `ts` values (for in-thread detection) lives in memory only; on restart, a thread reply is treated as a fresh turn in the mapped thread.

---

## Dependency

Add `@slack/bolt@^3.18` (bundles `@slack/web-api` + `@slack/socket-mode`). Socket Mode needs **no public URL, no signing secret** — just an app-level token (`xapp-…`, scope `connections:write`) and a bot token (`xoxb-…`). Bolt handles reconnection and 429 retries.

Required bot scopes: `app_mentions:read`, `chat:write`, `files:write`, `im:history`, `im:read`, `im:write`, `mpim:history`, `channels:history`, `groups:history`. Required event subscriptions: `message.im`, `message.mpim`, `message.channels`, `message.groups`, `app_mention`.

---

## Config schema

```ts
// src/server/types.ts
export type SlackChannelTrigger = 'mention' | 'all';

export interface SlackConfig {
  botToken: string | null;          // xoxb-…
  appToken: string | null;          // xapp-… (Socket Mode)
  enabled: boolean;
  allowedUserIds: string[];         // Slack user IDs (e.g. 'U01ABC…'); empty = allow anyone
  channelTrigger: SlackChannelTrigger;  // default 'mention'
}

export interface AppConfig {
  model: string;
  provider: ProviderConfig;
  providerOptions: Record<string, Record<string, unknown>>;
  callOptions: CallOptions;
  cwd: string;
  telegram: TelegramConfig;
  whatsapp: WhatsappConfig;
  slack: SlackConfig;
}
```

Defaults: `{ botToken: null, appToken: null, enabled: false, allowedUserIds: [], channelTrigger: 'mention' }`. `AppConfigPatch` gets `slack?: Partial<SlackConfig>` with the same shallow-merge pattern as Telegram. `getMasked()` also masks both tokens (`maskSecret`).

`Const` additions (`src/config/index.ts`):

```ts
public static readonly slackChatsPath = path.join(Const.fastyclawDir, 'slack-chats.json');
```

---

## Server module layout (modular-code)

```
src/slack/
├── index.ts      # FastyclawSlack (static)
├── types.ts
├── chats.ts      # SubmoduleFastyclawSlackChats   (channelId ↔ threadId map, persisted JSON)
├── bot.ts        # SubmoduleFastyclawSlackBot     (Bolt App wrapper, Socket Mode lifecycle)
├── handler.ts    # SubmoduleFastyclawSlackHandler (incoming event → agent loop → message edits)
└── stream.ts     # SlackStream                    (extends SubmoduleFastyclawServerStream)
```

```ts
// src/slack/index.ts
export class FastyclawSlack {
  public static readonly chats   = new SubmoduleFastyclawSlackChats();
  public static readonly bot     = new SubmoduleFastyclawSlackBot();
  public static readonly handler = new SubmoduleFastyclawSlackHandler(
    FastyclawSlack.bot,
    FastyclawSlack.chats,
  );

  public static async applyConfig(cfg: SlackConfig): Promise<void>;   // start/stop when tokens or enabled change
  public static async shutdown(): Promise<void>;                       // on SIGINT
}
```

### SubmoduleFastyclawSlackBot

```ts
public async start(botToken: string, appToken: string, onEvent: SlackEventHandler): Promise<void>;
public async stop(): Promise<void>;
public isRunning(): boolean;
public current(): App | null;
public botUserId(): string | null;       // cached from auth.test() on start
public tokens(): { botToken: string | null; appToken: string | null };
```

`start()` flow:
1. `const app = new App({ token: botToken, appToken, socketMode: true })`.
2. `const who = await app.client.auth.test({ token: botToken })` → stash `who.user_id` as `botUserId`.
3. `app.event('message', async ({ event, client }) => onEvent('message', event, client))`.
4. `app.event('app_mention', async ({ event, client }) => onEvent('app_mention', event, client))`.
5. `await app.start()` — Bolt connects via WebSocket.

### SubmoduleFastyclawSlackChats

Same shape as `SubmoduleFastyclawTelegramChats`, keyed by `channelId: string`:

```ts
public async load(): Promise<void>;
public async resolve(channelId: string, meta: ChatMeta): Promise<string>;
public async forget(channelId: string): Promise<void>;
public list(): Array<{ channelId: string; threadId: string; title: string; kind: SlackChannelKind }>;
public count(): number;
```

### SubmoduleFastyclawSlackHandler

Tracks bot-posted `ts` per channel in a `Map<string, Set<string>>` so threaded replies that don't @mention can still be routed:

```ts
private readonly ownTsByChannel = new Map<string, Set<string>>();
public rememberOwnTs(channel: string, ts: string): void;   // called by SlackStream after post/upload
public isOwnThread(channel: string, threadTs?: string): boolean;
```

`onEvent` logic (both `message` and `app_mention` collapse into this):

```ts
public handle = async (kind: 'message' | 'app_mention', event: SlackAnyEvent, client: WebClient): Promise<void> => {
  if ((event as any).subtype) return;
  if ((event as any).bot_id && (event as any).bot_id === this.botModule.botId()) return;
  const text = this.extractText(event);
  if (!text) return;
  const cfg = FastyclawServer.config.get().slack;
  if (!this.isAllowed(event.user, cfg)) return;
  if (!this.shouldRespond(kind, event, cfg)) return;

  const meta: ChatMeta = { title: this.chatTitle(event), kind: this.chatKind(event) };
  const threadId = await this.chats.resolve(event.channel, meta);
  const thread = await FastyclawServer.threads.load(threadId);
  if (!thread) return;
  const replyThreadTs = event.thread_ts ?? event.ts;
  await this.runTurn(client, event.channel, replyThreadTs, thread, this.speakerPrefixed(event, text));
};
```

`runTurn` is structurally identical to Telegram's: activate thread, build `SlackStream`, construct `Run`, invoke `AgentRuntime.loop.run`, `drain`, deactivate. Differences: pass `(client, channel, threadTs)` into the `SlackStream` constructor and register the stream's anchor `ts` back into `ownTsByChannel` on every `chat.postMessage` / `files.uploadV2` that returns.

`shouldRespond` rules:
- `kind === 'app_mention'` → always true.
- `event.channel_type === 'im'` → true.
- `cfg.channelTrigger === 'all'` → true.
- `text.startsWith('/ask')` → true.
- `event.thread_ts && this.isOwnThread(event.channel, event.thread_ts)` → true.
- Else → false.

`speakerPrefixed`: DMs emit raw text; MPIM/channel/group messages get `@{event.user}: ` prefix. (User display name lookup via `users.info` is out of scope v1 — id is enough for the model.)

---

## Stream — `SlackStream`

Slack supports `chat.update` at Tier 3 (~50/min); edit throttle **1200 ms** (same as WhatsApp — conservative buffer for bursty tool-call sequences). Full buffer/anchor pattern as `TelegramStream` / `WhatsappStream`:

```ts
export class SlackStream extends SubmoduleFastyclawServerStream {
  public constructor(
    private readonly client: WebClient,
    private readonly channel: string,
    private readonly threadTs: string,
    private readonly onOwnTs: (ts: string) => void,
  ) { super(); }
  public async init(): Promise<void>;        // chat.postMessage → stash returned ts as anchor
  public override write(event: ServerEvent): void;
  public override end(): void;
  public override isClosed(): boolean;
  public async drain(): Promise<void>;
}
```

Event handling mirrors `WhatsappStream` 1:1:
- `text-delta` → append to buffer, `scheduleEdit()`.
- `tool-call` → record name in `toolNames` map only (no visible line).
- `tool-result` → if `name === 'send_files'`, call `handleSendFilesResult`.
- `error` → append `\n⚠️ {message}`, force edit.
- `done` → force edit.

`flushNow()` uses `client.chat.update({ channel, ts: anchorTs, text })`. On failure (e.g. message too old — rare on Slack), fall back to a fresh `chat.postMessage({ channel, thread_ts, text })` and re-anchor. Every successful `chat.postMessage` threads through `onOwnTs(ts)` so the handler tracks bot-authored `ts` values per channel.

Text bound: Slack hard-limits single messages to ~40000 chars; use `SLACK_MAX = 12000` (conservative) with tail-truncation in `render()`.

### send_files normalization

Same invariant as the WhatsApp plan: `send_files.toModelOutput` stays text-only; `SlackStream` consumes the `tool-result` event to ship bytes out-of-band via `files.uploadV2`. Same 3-phase flow as `WhatsappStream.handleSendFilesResult`:

1. Snapshot current anchor (`priorTs`, `priorLastSent`) and any buffered text.
2. Detach anchor synchronously so incoming `text-delta`s accumulate for the post-attachment anchor.
3. Queue onto `this.flushing`:
   a. Finalize the pre-attachment anchor via `chat.update({ channel, ts: priorTs, text })` if buffered text exists.
   b. For each `SendFileEntry`, call `sendAttachment(file)` → `client.files.uploadV2({ channel_id: channel, thread_ts, file: fs.createReadStream(file.path), filename: path.basename(file.path) })`. Slack auto-detects image/video/audio from mimetype; no kind-based branching needed. `onOwnTs(res.files[0].ts)` after each upload so threaded replies still route.
   c. Post a fresh `'…'` placeholder via `chat.postMessage({ channel, thread_ts, text: '…' })`; stash new `ts` as anchor; `onOwnTs(ts)`.

`send_files` itself needs no change — `SendFilesResult` is channel-agnostic. The prompt broadened in the WhatsApp plan ("send to Telegram/WhatsApp/etc.") extends to "Slack" too — add to the same string.

Screenshot base64 in `toModelOutput` already resizes to `MAX_DIMENSION=1440` — no Slack-specific change.

---

## Config and lifecycle wiring

In `FastyclawServer.start()`, after the WhatsApp block:

```ts
await FastyclawSlack.chats.load();
await FastyclawSlack.applyConfig(FastyclawServer.config.get().slack);
```

`applyConfig` logic (mirrors Telegram's token-change handling):

```ts
const { botToken, appToken, enabled } = cfg;
const running = bot.isRunning();
if (!enabled || !botToken || !appToken) { if (running) await bot.stop(); return; }
const { botToken: cur_b, appToken: cur_a } = bot.tokens();
if (running && cur_b === botToken && cur_a === appToken) return;
if (running) await bot.stop();
await bot.start(botToken, appToken, FastyclawSlack.handler.handle);
```

`process.on('SIGINT' | 'SIGTERM', FastyclawSlack.shutdown)` — calls `app.stop()`.

---

## HTTP routes

Mounted by `SubmoduleFastyclawServerRoutes`, parallel to `/telegram/*` and `/whatsapp/*`:

| Method | Path                             | Body / response                                                                     |
|--------|----------------------------------|-------------------------------------------------------------------------------------|
| GET    | `/slack/config`                  | → `SlackConfig` (both tokens masked).                                               |
| POST   | `/slack/config`                  | `{ botToken?, appToken?, enabled?, allowedUserIds?, channelTrigger? }` → `{ ok, config }`. |
| POST   | `/slack/start`                   | Sets `enabled=true`. 400 if either token missing.                                   |
| POST   | `/slack/stop`                    | Sets `enabled=false`, stops socket.                                                 |
| GET    | `/slack/status`                  | `{ running, botUserId: string \| null, chatCount }`.                                |
| GET    | `/slack/chats`                   | Returns `chats.list()`.                                                             |
| DELETE | `/slack/chats/:channelId`        | Calls `chats.forget()`.                                                             |

Every write routes through `AppConfigStore.patch({ slack })` then `FastyclawSlack.applyConfig(next.slack)`.

---

## Client SDK

```ts
// client-sdk/src/slack.ts
export class FastyclawClientSlack {
  public constructor(private readonly baseUrl: string) {}
  public async getConfig(): Promise<SlackConfig>;
  public async setBotToken(token: string): Promise<void>;
  public async setAppToken(token: string): Promise<void>;
  public async setAllowedUsers(ids: string[]): Promise<void>;
  public async setChannelTrigger(mode: 'mention' | 'all'): Promise<void>;
  public async enable(): Promise<void>;
  public async disable(): Promise<void>;
  public async status(): Promise<{ running: boolean; botUserId: string | null; chatCount: number }>;
  public async listChats(): Promise<Array<{ channelId: string; threadId: string; title: string; kind: SlackChannelKind }>>;
  public async forgetChat(channelId: string): Promise<void>;
}

// client-sdk/src/client.ts
public readonly slack = new FastyclawClientSlack(this.baseUrl);
```

Re-export `SlackConfig`, `SlackChannelTrigger`, `SlackChannelKind`, `SlackChatListItem`, `SlackStatus` from `client-sdk/src/types.ts`. Add `slack: SlackConfig` to the mirrored `AppConfig`.

---

## CLI

Extend `src/cli.ts` parallel to telegram/whatsapp:

```txt
fastyclaw slack status
fastyclaw slack set-bot-token <xoxb-…>
fastyclaw slack set-app-token <xapp-…>
fastyclaw slack allow <userId> [<userId> ...]
fastyclaw slack trigger <mention|all>
fastyclaw slack start
fastyclaw slack stop
fastyclaw slack chats
fastyclaw slack forget <channelId>
```

`handleSlack` dispatches to the endpoints above using the same `request()` helper.

---

## Workflow

1. User creates a Slack app at `api.slack.com/apps`, enables Socket Mode, adds the scopes + event subscriptions listed above, installs to workspace → copies `xoxb-…` and generates an `xapp-…` token.
2. `fastyclaw start` boots; `FastyclawSlack.applyConfig` sees `botToken: null`, does nothing.
3. `fastyclaw slack set-bot-token xoxb-…` + `fastyclaw slack set-app-token xapp-…` + `fastyclaw slack start`. `applyConfig` calls `bot.start(...)`; Bolt opens the WebSocket; `auth.test` caches `botUserId`.
4. User DMs the bot. Bolt fires `message` → handler filters (no subtype, not own bot, allowed user, respond rule) → `chats.resolve(event.channel)` returns/creates a `threadId` → a `Run` with a `SlackStream` anchored to a fresh `chat.postMessage({ channel, thread_ts: event.ts, text: '…' })` streams back via `chat.update`.
5. Agent calls `send_files` with a screenshot. `tool-result` → `SlackStream.handleSendFilesResult` → finalize prior anchor → `files.uploadV2({ channel_id, thread_ts, file, filename })` per file → fresh `'…'` placeholder as new anchor. `send_files.toModelOutput` returns text only; no image bytes re-enter context.
6. In a channel: someone writes `@fastyclaw how tall is the Empire State?`. `app_mention` fires → same runTurn. The bot replies threaded under the mention; subsequent plain replies in that thread route back to the same fastyclaw thread via `isOwnThread`.
7. `fastyclaw slack stop` flips `enabled=false`; `bot.stop()` closes the socket. Chat map stays; re-enabling resumes seamlessly.

---

## Out of scope (v1)

- Inbound non-text (files, images, voice clips, snippets). Handler ignores.
- Emoji reactions, typing indicators, ephemeral messages, Block Kit-rich output.
- Slash commands beyond `/ask` as a channel trigger.
- HTTP/webhook mode (Socket Mode only).
- Multi-workspace / multi-app-token — one bot at a time.
- Per-channel model or cwd overrides.
- User display-name resolution (`users.info`) — the raw `U…` id is used in speaker prefixes.
- Encrypted token storage; tokens live in `config.json` alongside Telegram's.
