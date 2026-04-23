# discord

Expose the running fastyclaw server to a Discord bot so a user can message the bot (DM, guild channel, or thread) and have the agent loop respond — with the bot's token and on/off state configurable via both the CLI and the client SDK. Mirrors the Telegram integration ([plans/telegram.md](./telegram.md)) and WhatsApp integration ([plans/whatsapp.md](./whatsapp.md)) end to end.

---

## Chat → thread mapping

Each Discord `channelId` (DM, guild text channel, or thread) maps 1:1 to a persistent fastyclaw `Thread`. First inbound message in a channel creates the thread; subsequent messages reuse it. Guild channel members share one thread — the agent treats the channel as a single conversation, prefixing each user message with `@username:` so the model can disambiguate speakers.

- **DMs** (`channel.type === ChannelType.DM`): reply to every message.
- **Guild text channels** (`GuildText`) and **threads** (`PublicThread`/`PrivateThread`): only react when the bot is `@mentioned` (`message.mentions.has(client.user)`), the message is a reply to a bot message (`message.reference?.messageId` resolves to a bot message), or the text starts with `/ask`. Otherwise ignore.
- **Ignore** all `message.author.bot === true` (including own messages), system messages, and non-text payloads (images/audio/etc — v1 scope).

Mapping is persisted to `~/.fastyclaw/discord-chats.json`:

```ts
// { [channelId: string]: { threadId: string; title: string; kind: 'dm' | 'guild' | 'thread' } }
```

---

## Dependency

Add `discord.js@^14.16`. Official client, Gateway WebSocket + REST, supports DM/guild/thread channels uniformly via the `Channel` API.

Auth: a single bot token from the Discord Developer Portal. No QR / multi-file session — same shape as Telegram.

---

## Config schema

Extend `AppConfig` with an optional `discord` block. Token lives in the same `~/.fastyclaw/config.json` as the Telegram token.

```ts
// src/server/types.ts
export type DiscordGroupTrigger = 'mention' | 'all';

export interface DiscordConfig {
  token: string | null;
  enabled: boolean;
  allowedUserIds: string[];          // Discord user snowflakes; empty = allow anyone
  groupTrigger: DiscordGroupTrigger; // default 'mention'
}

export interface AppConfig {
  model: string;
  provider: ProviderConfig;
  providerOptions: Record<string, Record<string, unknown>>;
  callOptions: CallOptions;
  cwd: string;
  telegram: TelegramConfig;
  whatsapp: WhatsappConfig;
  discord: DiscordConfig;
}
```

Defaults: `{ token: null, enabled: false, allowedUserIds: [], groupTrigger: 'mention' }`. `AppConfigStore.patch()` gets a `discord?: Partial<DiscordConfig>` branch (shallow merge).

`Const` additions (`src/config/index.ts`):

```ts
public static readonly discordChatsPath = path.join(Const.fastyclawDir, 'discord-chats.json');
```

No auth dir — token is in `config.json`, identical to Telegram.

---

## Server module layout (modular-code)

```
src/discord/
├── index.ts      # FastyclawDiscord (static)
├── types.ts
├── chats.ts      # SubmoduleFastyclawDiscordChats   (channelId ↔ threadId map, persisted JSON)
├── client.ts     # SubmoduleFastyclawDiscordClient  (discord.js Client wrapper, lifecycle)
├── handler.ts    # SubmoduleFastyclawDiscordHandler (incoming msg → agent loop → message edits)
└── stream.ts     # DiscordStream                     (extends SubmoduleFastyclawServerStream)
```

```ts
// src/discord/index.ts
export class FastyclawDiscord {
  public static readonly chats   = new SubmoduleFastyclawDiscordChats();
  public static readonly client  = new SubmoduleFastyclawDiscordClient();
  public static readonly handler = new SubmoduleFastyclawDiscordHandler(
    FastyclawDiscord.client,
    FastyclawDiscord.chats,
  );

  public static async applyConfig(cfg: DiscordConfig): Promise<void>;  // start/stop as needed; restart on token change
  public static async shutdown(): Promise<void>;                        // on SIGINT
}
```

### SubmoduleFastyclawDiscordClient

Wraps `new Client({ intents: [Guilds, GuildMessages, MessageContent, DirectMessages], partials: [Channel] })`. `partials: [Channel]` is required to receive DM events — Discord won't deliver them otherwise.

```ts
public async start(token: string, onMessage: DiscordMessageHandler): Promise<void>;
public async stop(): Promise<void>;
public isRunning(): boolean;
public current(): Client | null;
public botUser(): { id: string; tag: string } | null;
public currentToken(): string | null;
```

`start()` flow:
1. `client = new Client({ intents, partials })`.
2. `client.on(Events.MessageCreate, m => onMessage(m))`.
3. `client.once(Events.ClientReady, () => { running = true; botUser = client.user; })`.
4. `await client.login(token)`.

`stop()` calls `client.destroy()` and clears `running`.

### SubmoduleFastyclawDiscordChats

Same shape as `SubmoduleFastyclawWhatsappChats`, keyed by channelId string:

```ts
public async load(): Promise<void>;
public async resolve(channelId: string, meta: ChatMeta): Promise<string>;
public async forget(channelId: string): Promise<void>;
public list(): Array<{ channelId: string; threadId: string; title: string; kind: DiscordChatKind }>;
public count(): number;
```

### SubmoduleFastyclawDiscordHandler

Mirrors the WhatsApp handler's trigger rules and `runTurn` driver.

```ts
public handle = async (m: Message): Promise<void> => {
  if (m.author.bot) return;
  if (m.system) return;
  const text = m.content?.trim();
  if (!text) return;
  const cfg = FastyclawServer.config.get().discord;
  if (!this.isAllowed(m.author.id, cfg)) return;
  if (!this.shouldRespond(m, text, cfg)) return;

  const kind = this.chatKind(m);
  const meta: ChatMeta = { title: this.chatTitle(m, kind), kind };
  const threadId = await this.chats.resolve(m.channelId, meta);
  const thread = await FastyclawServer.threads.load(threadId);
  if (!thread) return;
  await this.runTurn(m, thread, this.speakerPrefixed(m, text, kind));
};
```

`shouldRespond` for DMs returns `true`; for guild/thread channels returns `true` iff `cfg.groupTrigger === 'all'`, `text.startsWith('/ask')`, `m.mentions.has(this.clientModule.botUser()!.id)`, or the message is a reply to a message authored by the bot user.

`speakerPrefixed` for DMs returns the body unchanged; for guild/thread it strips a leading bot mention (`<@BOT_ID>` or `<@!BOT_ID>`) and a leading `/ask`, then returns `@${m.author.username}: ${body}`.

`runTurn` is structurally identical to `SubmoduleFastyclawWhatsappHandler.runTurn`: activate thread, build `DiscordStream`, construct `Run`, invoke `AgentRuntime.loop.run`, `drain`, deactivate.

---

## Stream — `DiscordStream`

Discord lets bots edit their own messages indefinitely (no time window like WhatsApp). Hard limit: **2000 characters per message**. We throttle edits to **800 ms** (match Telegram) and follow the same buffer/anchor pattern as `WhatsappStream`, with one extra concern: when the buffer would exceed 2000 chars, finalize the current anchor and open a new one.

```ts
export class DiscordStream extends SubmoduleFastyclawServerStream {
  public constructor(private readonly channel: TextBasedChannel) { super(); }
  public async init(): Promise<void>;          // channel.send('…') → store Message as anchor
  public override write(event: ServerEvent): void;
  public override end(): void;
  public override isClosed(): boolean;
  public async drain(): Promise<void>;
}
```

Event handling mirrors `WhatsappStream` 1:1 except for the 2000-char split:
- `text-delta` → append to buffer; if `buffer.length > 1900`, force-finalize the anchor and roll over to a fresh `'…'` placeholder; else `scheduleEdit()`.
- `tool-call` → record name in `toolNames` map only (no visible line).
- `tool-result` → if `name === 'send_files'`, call `handleSendFilesResult`.
- `error` → append `\n⚠️ {message}`, force edit.
- `done` → force edit.

`flushNow()` uses `anchor.edit({ content: text })`. On edit failure (anchor deleted or channel gone), fall back to `channel.send` and update the anchor.

### send_files normalization

Identical contract to `WhatsappStream.handleSendFilesResult` — `send_files.toModelOutput` returns only a text summary, the stream consumes the raw file list out-of-band:

1. Snapshot current anchor (`priorMessage`, `priorLastSent`) and pending buffered text.
2. Detach anchor synchronously (`this.anchor = null; this.buffer = ''`).
3. Queue onto `this.flushing`:
   a. Finalize the pre-attachment anchor with any pending text via `priorMessage.edit`.
   b. For each `SendFileEntry`, call `sendAttachment(file)`.
   c. Send a fresh `'…'` placeholder; set it as the new anchor.

`sendAttachment` uses `discord.js` `AttachmentBuilder` for every kind — Discord doesn't distinguish photo/video/voice at the API level, just files with names and content types:

```ts
const attachment = new AttachmentBuilder(file.path, { name: basename(file.path) });
await this.channel.send({ files: [attachment] });
```

If a file exceeds the channel's upload size (default 10 MB; check `channel.guild?.maximumBandwidth` is unreliable — just catch the error), post a fallback text message: `⚠️ {name} too large to attach ({size} MB)`.

`send_files` itself ([src/agent/tools/send-files.ts](../src/agent/tools/send-files.ts)) needs **no change**. The existing prompt line "send to the user (Telegram/WhatsApp/etc.)" already covers Discord; no edit needed.

---

## Config and lifecycle wiring

In `FastyclawServer.start()`, after the WhatsApp block:

```ts
await FastyclawDiscord.chats.load();
await FastyclawDiscord.applyConfig(FastyclawServer.config.get().discord);
```

`applyConfig` logic (mirrors Telegram's token-aware variant):

```ts
const wantRunning = !!cfg.token && cfg.enabled;
if (!wantRunning) { if (client.isRunning()) await client.stop(); return; }
if (client.isRunning() && client.currentToken() === cfg.token) return;
if (client.isRunning()) await client.stop();
await client.start(cfg.token!, FastyclawDiscord.handler.handle);
```

`process.on('SIGINT' | 'SIGTERM')` handler adds `FastyclawDiscord.shutdown()` to the existing `Promise.allSettled([...])` list.

---

## HTTP routes

Mounted by `SubmoduleFastyclawServerRoutes`, parallel to `/telegram/*`:

| Method | Path                              | Body / response                                                                       |
|--------|-----------------------------------|---------------------------------------------------------------------------------------|
| GET    | `/discord/config`                 | → `DiscordConfig` (token masked: `…last4`).                                           |
| POST   | `/discord/config`                 | `{ token?, enabled?, allowedUserIds?, groupTrigger? }` → `{ ok, config }`.            |
| POST   | `/discord/start`                  | Sets `enabled=true`, calls `applyConfig`. 400 if no token.                            |
| POST   | `/discord/stop`                   | Sets `enabled=false`, stops the client.                                               |
| GET    | `/discord/status`                 | `{ running, botUser: { id, tag } \| null, chatCount }`.                               |
| GET    | `/discord/chats`                  | Returns `chats.list()`.                                                               |
| DELETE | `/discord/chats/:channelId`       | Calls `chats.forget()`.                                                               |

All routes write through `AppConfigStore` so state survives restart.

---

## Client SDK

```ts
// client-sdk/src/discord.ts
export class FastyclawClientDiscord {
  public constructor(private readonly baseUrl: string) {}
  public async getConfig(): Promise<DiscordConfig>;
  public async setToken(token: string): Promise<void>;
  public async setAllowedUsers(ids: string[]): Promise<void>;
  public async setGroupTrigger(mode: DiscordGroupTrigger): Promise<void>;
  public async enable(): Promise<void>;
  public async disable(): Promise<void>;
  public async status(): Promise<DiscordStatus>;
  public async listChats(): Promise<DiscordChatListItem[]>;
  public async forgetChat(channelId: string): Promise<void>;
}

// client-sdk/src/client.ts — one new field
public readonly discord = new FastyclawClientDiscord(this.baseUrl);
```

Re-export `DiscordConfig`, `DiscordGroupTrigger`, `DiscordStatus`, `DiscordChatListItem`, `DiscordChatKind` from `client-sdk/src/types.ts` and at the package entry in `client-sdk/src/index.ts`.

---

## CLI

Extend `src/cli.ts` parallel to the telegram subcommands:

```txt
fastyclaw discord status
fastyclaw discord set-token <token>
fastyclaw discord allow <userId> [, <userId> ...]
fastyclaw discord trigger <mention|all>
fastyclaw discord start
fastyclaw discord stop
fastyclaw discord chats
fastyclaw discord forget <channelId>
```

Each subcommand `fetch`es `http://localhost:${Const.DEFAULT_PORT}`. Unreachable server prints `fastyclaw server not running — run 'fastyclaw start' first.` and exits non-zero.

---

## Workflow

1. User runs `fastyclaw start`. Server boots; `FastyclawDiscord.applyConfig` sees `token: null`, does nothing.
2. User creates a bot in the Discord Developer Portal, enables the **Message Content** privileged intent, copies the token, and runs `fastyclaw discord set-token <token>` then `fastyclaw discord start`. `applyConfig` calls `client.start(token, handler.handle)`. Gateway connects; `Events.ClientReady` fires.
3. User invites the bot to a guild (`https://discord.com/api/oauth2/authorize?client_id=…&scope=bot&permissions=…`) or opens a DM.
4. Someone messages the bot. `Events.MessageCreate` → handler filters (allowed user, trigger rule, text-only) → `chats.resolve(channelId)` returns/creates a `threadId` → a `Run` with a `DiscordStream` drives `AgentRuntime.loop.run` via `message.edit`.
5. Agent calls `send_files` with a screenshot path. `tool-result` reaches `DiscordStream.handleSendFilesResult` → finalizes the prior anchor → uploads each file via `channel.send({ files: [AttachmentBuilder] })` → opens a fresh `'…'` anchor for continued streaming.
6. `fastyclaw discord stop` → `enabled=false`, `client.destroy()`. Chat map intact — re-enabling resumes silently.

---

## Out of scope (v1)

- Inbound non-text messages (images, audio, attachments, stickers, embeds). Handler ignores.
- Slash commands / interactions API (only message-based triggers in v1).
- Guild-level allowlists (only per-user). Per-channel allowlists also out.
- Voice channels, stage channels, forum posts.
- Sharding (single-process bot only — fine up to ~2,500 guilds).
- Per-channel model/cwd overrides — uses whatever `AppConfig` currently holds.
- Encryption of the token on disk; lives in `config.json` like every other field.
