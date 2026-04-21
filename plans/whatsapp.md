# whatsapp

Expose the running fastyclaw server to a WhatsApp account so a user can message the agent (privately or in a group) and have the agent loop respond — with pairing state and on/off toggle configurable via both the CLI and the client SDK. Mirrors the Telegram integration ([plans/telegram.md](./telegram.md)) end to end.

---

## Chat → thread mapping

Each WhatsApp `jid` (e.g. `34612345678@s.whatsapp.net` for private, `...@g.us` for group) maps 1:1 to a persistent fastyclaw `Thread`. First inbound message from a jid creates the thread; subsequent messages reuse it. Group members share one thread — the agent treats the chat as a single conversation, prefixing each user message with `@pushName:` so the model can disambiguate speakers.

- **Private chats** (`@s.whatsapp.net`): reply to every message.
- **Group chats** (`@g.us`): only react when the bot is `@mentioned` (jid appears in `message.extendedTextMessage.contextInfo.mentionedJid`), the message is a reply to a bot message (`contextInfo.participant === ownJid`), or the text starts with `/ask`. Otherwise ignore.
- **Ignore** all `status@broadcast`, `fromMe` messages, and non-text payloads (images/audio/etc — v1 scope).

Mapping is persisted to `~/.fastyclaw/whatsapp-chats.json`:

```ts
// { [jid: string]: { threadId: string; title: string; kind: 'private' | 'group' } }
```

---

## Dependency

Add `@whiskeysockets/baileys@^6.7` + `qrcode-terminal@^0.12` (for QR pairing on first run). Baileys is the actively-maintained TS WhatsApp Web fork — no business verification, pairs with a regular number, supports multi-device auth state on disk.

Rationale over Meta Cloud API: we want the same "drop-in credential, start chatting" UX that the Telegram bot has. Cloud API requires a verified Business account, a webhook with a public URL, and a phone-number ID — incompatible with long-polling-style local dev. Baileys persists auth to a folder and reconnects silently after the first QR scan.

---

## Config schema

Extend `AppConfig` with an optional `whatsapp` block. Unlike Telegram there is no "token" — auth is a multi-file session that Baileys manages under `~/.fastyclaw/whatsapp-auth/`. The config only carries toggles and filters.

```ts
// src/server/types.ts
export interface WhatsappConfig {
  enabled: boolean;                 // whether the socket should run
  allowedJids: string[];            // empty = allow anyone; otherwise whitelist (bare jids, e.g. '34612345678@s.whatsapp.net')
  groupTrigger: 'mention' | 'all';  // default 'mention'
}

export interface AppConfig {
  model: string;
  provider: Provider;
  cwd: string;
  telegram: TelegramConfig;
  whatsapp: WhatsappConfig;
}
```

Defaults: `{ enabled: false, allowedJids: [], groupTrigger: 'mention' }`. `AppConfigStore.patch()` gets a `whatsapp?: Partial<WhatsappConfig>` branch (shallow merge).

`Const` additions (`src/config/index.ts`):

```ts
public static readonly whatsappAuthDir = path.join(Const.fastyclawDir, 'whatsapp-auth');
public static readonly whatsappChatsPath = path.join(Const.fastyclawDir, 'whatsapp-chats.json');
```

---

## Server module layout (modular-code)

```
src/whatsapp/
├── index.ts      # FastyclawWhatsapp (static)
├── types.ts
├── chats.ts      # SubmoduleFastyclawWhatsappChats   (jid ↔ threadId map, persisted JSON)
├── sock.ts       # SubmoduleFastyclawWhatsappSock    (Baileys socket wrapper, lifecycle, QR emit)
├── handler.ts    # SubmoduleFastyclawWhatsappHandler (incoming msg → agent loop → message edits)
└── stream.ts     # WhatsappStream                     (extends SubmoduleFastyclawServerStream)
```

```ts
// src/whatsapp/index.ts
export class FastyclawWhatsapp {
  public static readonly chats   = new SubmoduleFastyclawWhatsappChats();
  public static readonly sock    = new SubmoduleFastyclawWhatsappSock();
  public static readonly handler = new SubmoduleFastyclawWhatsappHandler(
    FastyclawWhatsapp.sock,
    FastyclawWhatsapp.chats,
  );

  public static async applyConfig(cfg: WhatsappConfig): Promise<void>;  // start/stop as needed
  public static async shutdown(): Promise<void>;                         // on SIGINT
  public static latestQr(): string | null;                               // most recent QR string (ANSI-renderable) or null
}
```

### SubmoduleFastyclawWhatsappSock

Wraps `makeWASocket({ auth: state, printQRInTerminal: false })` from Baileys. Uses `useMultiFileAuthState(Const.whatsappAuthDir)` so credentials survive restarts.

```ts
public async start(onMessage: WhatsappMessageHandler): Promise<void>;
public async stop(): Promise<void>;
public isRunning(): boolean;
public current(): WASocket | null;
public ownJid(): string | null;
public latestQr(): string | null;     // updated via connection.update events
public isPaired(): boolean;            // creds.registered === true
```

`start()` flow:
1. `useMultiFileAuthState(Const.whatsappAuthDir)` → `state, saveCreds`.
2. `sock = makeWASocket({ auth: state, ... })`.
3. `sock.ev.on('creds.update', saveCreds)`.
4. `sock.ev.on('connection.update', ...)` — captures `qr` (store, log to terminal via `qrcode-terminal.generate`), sets `running` on `connection === 'open'`, and auto-reconnects on `connection === 'close'` unless `DisconnectReason.loggedOut` (then clears `running` and deletes auth dir).
5. `sock.ev.on('messages.upsert', ({ messages }) => onMessage(messages))`.

### SubmoduleFastyclawWhatsappChats

Same shape as `SubmoduleFastyclawTelegramChats`, keyed by jid string:

```ts
public async load(): Promise<void>;
public async resolve(jid: string, meta: ChatMeta): Promise<string>;
public async forget(jid: string): Promise<void>;
public list(): Array<{ jid: string; threadId: string; title: string; kind: 'private' | 'group' }>;
public count(): number;
```

### SubmoduleFastyclawWhatsappHandler

Mirrors the Telegram handler's trigger rules and `runTurn` driver.

```ts
public handle = async (msgs: WAMessage[]): Promise<void> => {
  for (const m of msgs) {
    if (m.key.fromMe) continue;
    if (m.key.remoteJid === 'status@broadcast') continue;
    const text = this.extractText(m);               // conversation || extendedTextMessage.text
    if (!text) continue;
    const cfg = FastyclawServer.config.get().whatsapp;
    if (!this.isAllowed(m.key.remoteJid!, cfg)) continue;
    if (!this.shouldRespond(m, cfg)) continue;

    const meta: ChatMeta = { title: this.chatTitle(m), kind: this.chatKind(m.key.remoteJid!) };
    const threadId = await this.chats.resolve(m.key.remoteJid!, meta);
    const thread = await FastyclawServer.threads.load(threadId);
    if (!thread) continue;
    await this.runTurn(m.key.remoteJid!, thread, this.speakerPrefixed(m, text));
  }
};
```

`runTurn` is structurally identical to `SubmoduleFastyclawTelegramHandler.runTurn`: activate thread, build `WhatsappStream`, construct `Run`, invoke `AgentRuntime.loop.run`, `drain`, deactivate.

---

## Stream — `WhatsappStream`

WhatsApp has no native "edit message" on older protocols, but Baileys supports `sock.sendMessage(jid, { edit: key, text: newText })` for the last ~15 minutes of a message's life. We throttle edits to **1200 ms** (more conservative than Telegram's 800 ms; WhatsApp rate-limits edits more aggressively) and follow the exact same buffer/anchor pattern as `TelegramStream`:

```ts
export class WhatsappStream extends SubmoduleFastyclawServerStream {
  public constructor(private readonly sock: WASocket, private readonly jid: string) { super(); }
  public async init(): Promise<void>;          // sendMessage(jid, { text: '…' }) → store key as anchor
  public override write(event: ServerEvent): void;
  public override end(): void;
  public override isClosed(): boolean;
  public async drain(): Promise<void>;
}
```

Event handling mirrors `TelegramStream` 1:1:
- `text-delta` → append to buffer, `scheduleEdit()`.
- `tool-call` → record name in `toolNames` map only (no visible line — keeps WhatsApp output focused on assistant text, matching recent Telegram behavior).
- `tool-result` → if `name === 'send_files'`, call `handleSendFilesResult`.
- `error` → append `\n⚠️ {message}`, force edit.
- `done` → force edit.

`flushNow()` uses `sock.sendMessage(jid, { edit: anchorKey, text })`. On `edit` failure (e.g. "message too old"), fall back to sending a fresh message and updating the anchor.

### send_files normalization (the critical bit)

Image payloads must **never** flow back into the model context from the Telegram/WhatsApp channel — that's what blew up context before commit a2e61ba. `send_files` stays the single path: its `toModelOutput` returns only a short text summary, and the WhatsApp stream consumes the raw file list from the `tool-result` event to ship bytes out-of-band. Exact mirror of `TelegramStream.handleSendFilesResult`:

1. Snapshot current anchor (`priorMessageKey`, `priorLastSent`) and any pending buffered text.
2. Detach anchor synchronously (`this.anchorKey = null; this.buffer = ''`) so new `text-delta`s accumulate for the post-attachment anchor.
3. Queue onto `this.flushing`:
   a. Finalize the pre-attachment anchor with any pending text via `sendMessage({ edit })`.
   b. For each `SendFileEntry`, call `sendAttachment(file)`.
   c. Send a fresh `'…'` placeholder; set it as the new anchor.

`sendAttachment` maps `SendFileKind` → Baileys content:

| kind | Baileys payload |
|---|---|
| `photo` | `{ image: { url: file.path } }` |
| `video` | `{ video: { url: file.path } }` |
| `audio` | `{ audio: { url: file.path }, mimetype: file.mediaType }` |
| `voice` | `{ audio: { url: file.path }, ptt: true, mimetype: 'audio/ogg; codecs=opus' }` |
| `document` | `{ document: { url: file.path }, fileName: basename(file.path), mimetype: file.mediaType }` |

`send_files` itself (in [src/agent/tools/send-files.ts](../src/agent/tools/send-files.ts)) needs **no change** — its `SendFilesResult` is channel-agnostic; `WhatsappStream` consumes it identically to `TelegramStream`. The prompt line added in commit 99fd2eb already mentions "send to Telegram"; broaden to "send to the user (Telegram/WhatsApp/etc.)".

Screenshot context safety ([src/agent/tools/screenshot.ts](../src/agent/tools/screenshot.ts)) is already handled by the `MAX_DIMENSION=1440` resize + base64 in `toModelOutput` — no changes needed for WhatsApp.

---

## Config and lifecycle wiring

In `FastyclawServer.start()`, after the Telegram block:

```ts
await FastyclawWhatsapp.chats.load();
await FastyclawWhatsapp.applyConfig(FastyclawServer.config.get().whatsapp);
```

`applyConfig` logic:

```ts
const wantRunning = cfg.enabled;
if (!wantRunning) { if (sock.isRunning()) await sock.stop(); return; }
if (sock.isRunning()) return;     // auth is folder-based; no token to compare
await sock.start(FastyclawWhatsapp.handler.handle);
```

`process.on('SIGINT' | 'SIGTERM', FastyclawWhatsapp.shutdown)` — closes the socket cleanly via `sock.end(undefined)`.

---

## HTTP routes

Mounted by `SubmoduleFastyclawServerRoutes`, parallel to `/telegram/*`:

| Method | Path                       | Body / response                                                                     |
|--------|----------------------------|-------------------------------------------------------------------------------------|
| GET    | `/whatsapp/config`         | → `WhatsappConfig`.                                                                 |
| POST   | `/whatsapp/config`         | `{ enabled?, allowedJids?, groupTrigger? }` → `{ ok, config }`.                     |
| POST   | `/whatsapp/start`          | Sets `enabled=true`, calls `applyConfig`.                                           |
| POST   | `/whatsapp/stop`           | Sets `enabled=false`, stops the socket.                                             |
| GET    | `/whatsapp/status`         | `{ running, paired, ownJid: string \| null, chatCount }`.                           |
| GET    | `/whatsapp/qr`             | `{ qr: string \| null }` — raw QR payload for the caller to render.                 |
| POST   | `/whatsapp/logout`         | Wipes `~/.fastyclaw/whatsapp-auth/`, stops the socket. Forces re-pair on next start.|
| GET    | `/whatsapp/chats`          | Returns `chats.list()`.                                                             |
| DELETE | `/whatsapp/chats/:jid`     | Calls `chats.forget()`. `jid` URL-encoded.                                          |

All routes write through `AppConfigStore` so state survives restart.

---

## Client SDK

```ts
// client-sdk/src/whatsapp.ts
export class FastyclawClientWhatsapp {
  public constructor(private readonly baseUrl: string) {}
  public async getConfig(): Promise<WhatsappConfig>;
  public async setAllowedJids(jids: string[]): Promise<void>;
  public async setGroupTrigger(mode: 'mention' | 'all'): Promise<void>;
  public async enable(): Promise<void>;
  public async disable(): Promise<void>;
  public async status(): Promise<{ running: boolean; paired: boolean; ownJid: string | null; chatCount: number }>;
  public async qr(): Promise<string | null>;
  public async logout(): Promise<void>;
  public async listChats(): Promise<Array<{ jid: string; threadId: string; title: string; kind: 'private' | 'group' }>>;
  public async forgetChat(jid: string): Promise<void>;
}

// client-sdk/src/client.ts — one new field
public readonly whatsapp = new FastyclawClientWhatsapp(this.baseUrl);
```

Re-export `WhatsappConfig` from `client-sdk/src/types.ts`.

---

## CLI

Extend `src/cli.ts` parallel to the telegram subcommands:

```txt
fastyclaw whatsapp status
fastyclaw whatsapp qr                      # prints the current QR as ASCII (via qrcode-terminal)
fastyclaw whatsapp start
fastyclaw whatsapp stop
fastyclaw whatsapp logout
fastyclaw whatsapp allow <jid> [, <jid> ...]
fastyclaw whatsapp trigger <mention|all>
fastyclaw whatsapp chats
fastyclaw whatsapp forget <jid>
```

Each subcommand `fetch`es `http://localhost:${Const.DEFAULT_PORT}`. `fastyclaw whatsapp qr` polls `/whatsapp/qr` every 2 s until a non-null value arrives or the socket reports `paired=true`; then renders via `qrcode-terminal.generate(qr, { small: true })`.

---

## Workflow

1. User runs `fastyclaw start`. Server boots; `FastyclawWhatsapp.applyConfig` sees `enabled: false`, does nothing.
2. User runs `fastyclaw whatsapp start`. `POST /whatsapp/start` flips `enabled=true`; `applyConfig` calls `sock.start()`. Baileys emits a `qr` on `connection.update`; stored in `latestQr()` and tailed to stdout as ASCII.
3. User runs `fastyclaw whatsapp qr` (or reads stdout) and scans with WhatsApp → Linked Devices. `connection === 'open'` fires; creds persisted under `~/.fastyclaw/whatsapp-auth/`.
4. Someone messages the linked number. `messages.upsert` → handler filters (allowed jid, trigger rule, text-only) → `chats.resolve(jid)` returns/creates a `threadId` → a `Run` with a `WhatsappStream` drives `AgentRuntime.loop.run` via anchor-edits.
5. Agent calls `send_files` with a screenshot path. `tool-result` reaches `WhatsappStream.handleSendFilesResult` → finalizes the prior anchor → uploads each file via `sock.sendMessage({ image: { url }})` → opens a fresh `'…'` anchor for continued streaming. `send_files.toModelOutput` returns only a text summary, so no image bytes re-enter context.
6. `fastyclaw whatsapp stop` → `enabled=false`, `sock.stop()`. Auth folder intact — re-enabling reconnects silently.
7. `fastyclaw whatsapp logout` → wipes auth folder and chats file optionally kept; next `start` triggers fresh QR flow.

---

## Out of scope (v1)

- Inbound non-text messages (images, audio, documents, stickers, location). Handler ignores.
- Reactions, read receipts, typing indicators (cheap to add later via `sock.sendPresenceUpdate`).
- Multi-account / multi-number. One paired device at a time.
- Meta Cloud API backend (webhook variant).
- Per-chat model/cwd overrides — uses whatever `AppConfig` currently holds.
- E2E encryption guarantees beyond what Baileys already enforces; auth folder is plaintext on disk like `config.json`.
