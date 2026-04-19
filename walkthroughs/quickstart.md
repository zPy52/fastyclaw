# Quickstart

This project runs as a local HTTP server with a small client wrapper around it.

## Prerequisites

- Node.js 18 or newer
- An OpenAI API key in `OPENAI_API_KEY`

Optional, but useful for browser-based tools:

- A local Chrome/Chromium install
- Or a Playwright CDP endpoint via `FASTYCLAW_BROWSER_CDP_URL`

## Install

```bash
npm install
```

## Run locally

### Development mode

Use this while iterating:

```bash
npm run dev
```

This watches TypeScript and alias rewriting in the background.

### Deploy-like test

Use this before you ship or publish:

```bash
npm run build
npm start
```

The server listens on `http://127.0.0.1:5177` by default.

## Concepts

- **Config** lives at `~/.fastyclaw/config.json` and holds the chosen `model`,
  `provider`, and `cwd`. It is created on first run with defaults.
- **Threads** are JSON arrays of AI SDK UI messages, each stored at
  `~/.fastyclaw/threads/<uuid>.json`. Threads are only held in memory while
  the model is actively processing; otherwise they live only on disk.

## Smoke test

Read or update the global config:

```bash
curl -s http://127.0.0.1:5177/config
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.4-mini","cwd":"."}'
```

Send a message without specifying a thread — one will be created
automatically. The first SSE event is `{"type":"thread","threadId":"..."}`:

```bash
curl -N -X POST http://127.0.0.1:5177/messages \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"text":"Say hello and tell me the current working directory."}'
```

Or explicitly create a thread first, then send messages to it:

```bash
curl -s -X POST http://127.0.0.1:5177/threads
# → {"threadId":"<uuid>"}

curl -N -X POST http://127.0.0.1:5177/messages \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"threadId":"<uuid>","text":"Continue the conversation."}'
```

Delete a thread (removes `~/.fastyclaw/threads/<uuid>.json`):

```bash
curl -X DELETE http://127.0.0.1:5177/threads/<uuid>
```

## Telegram bot

Expose the running agent to a Telegram bot so you can chat with it from
your phone or a group. Each Telegram chat maps 1:1 to a persistent
fastyclaw thread, so context survives restarts.

### 1. Create a bot

Message [@BotFather](https://t.me/BotFather) on Telegram and run
`/newbot`. Pick a name and a username; BotFather replies with an HTTP
API token that looks like `123456:ABCdef...`.

For group chats, also send `/setprivacy` → pick your bot → `Disable` so
it can see messages that mention it.

### 2. Register the token

The server must already be running (`npm start`). Then, in another
terminal:

```bash
fastyclaw telegram set-token 123456:ABCdef...
fastyclaw telegram start
```

`set-token` writes to `~/.fastyclaw/config.json`; `start` launches the
long-polling loop. Check it:

```bash
fastyclaw telegram status
# { "running": true, "botUsername": "my_bot", "chatCount": 0 }
```

### 3. Say hi

Open Telegram, find your bot by its `@username`, and send a message.
You should see `…` appear and then stream in as the agent replies. Tool
calls show up as compact `🔧 name(...)` lines at the top of the
message.

### 4. Groups

Add the bot to a group. By default it only responds when:

- the message `@mentions` it,
- the message is a reply to one of its own messages, or
- the message starts with `/ask`.

Switch to responding to every message with:

```bash
fastyclaw telegram trigger all
```

Back to mention-only:

```bash
fastyclaw telegram trigger mention
```

### 5. Restrict who can talk to it

By default anyone who can DM the bot is allowed. To whitelist specific
Telegram user IDs:

```bash
fastyclaw telegram allow 12345678 87654321
```

Pass no IDs in the allow list (or clear it via the API) to open it back
up.

### 6. Stopping and forgetting

```bash
fastyclaw telegram stop            # pause the poller; chats are retained
fastyclaw telegram chats           # list chat → thread mappings
fastyclaw telegram forget <chatId> # unmap a chat (thread file is kept)
```

The chat map lives at `~/.fastyclaw/telegram-chats.json`.

### From the client SDK

```ts
import { FastyclawClient } from 'fastyclaw-client';

const client = new FastyclawClient();
await client.telegram.setToken('123456:ABC...');
await client.telegram.enable();
console.log(await client.telegram.status());
```

## Notes

- The default model is `gpt-5.4-mini`.
- Only the `openai` provider is supported right now.
- Browser tools are launched lazily, so the server can start without a browser installed, but browser actions will need a usable Chrome/Chromium setup.
