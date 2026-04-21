# Quickstart

This project runs as a local HTTP server with a small client wrapper around it.

## Prerequisites

- Node.js 18 or newer
- A provider credential for the backend you want to use, such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, or `AI_GATEWAY_API_KEY`

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
  `provider`, `providerOptions`, and `cwd`. It is created on first run with
  defaults.
- **Threads** are JSON arrays of AI SDK UI messages, each stored at
  `~/.fastyclaw/threads/<uuid>.json`. Threads are only held in memory while
  the model is actively processing; otherwise they live only on disk.

## Change model or provider

`fastyclaw` stores the active provider in `~/.fastyclaw/config.json`, but the
easiest way to switch is through the CLI:

```bash
fastyclaw provider list
fastyclaw provider show
fastyclaw provider set openai --model gpt-5.4-mini --key apiKey=$OPENAI_API_KEY
fastyclaw provider set anthropic --model claude-sonnet-4-5 --key apiKey=$ANTHROPIC_API_KEY
fastyclaw provider option set openai reasoningEffort high
fastyclaw provider option set anthropic thinking '{"type":"enabled","budgetTokens":10000}'
fastyclaw provider probe
```

- `provider set` changes the provider and model together.
- `provider option set` writes into the namespaced `providerOptions` bag.
- `provider models <id>` shows live model ids when the provider supports it.

For the full provider reference, see [providers.md](providers.md).

If you prefer to do the same thing over HTTP directly:

```bash
curl -s http://127.0.0.1:5177/providers
curl -s http://127.0.0.1:5177/config
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"provider":{"id":"openai","apiKey":"'$OPENAI_API_KEY'"},"model":"gpt-5.4-mini"}'
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"providerOptions":{"openai":{"reasoningEffort":"high"}}}'
curl -s -X POST http://127.0.0.1:5177/providers/openai/probe
```

## Smoke test

Read or update the global config:

```bash
curl -s http://127.0.0.1:5177/config
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"."}'
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

If you prefer to hit the local HTTP server directly, the equivalent
`curl` calls are:

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"token":"123456:ABCdef..."}'

curl -s -X POST http://127.0.0.1:5177/telegram/start

curl -s http://127.0.0.1:5177/telegram/status
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

Using `curl` against the local endpoint:

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"groupTrigger":"all"}'

curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"groupTrigger":"mention"}'
```

### 5. Restrict who can talk to it

By default anyone who can DM the bot is allowed. To whitelist specific
Telegram user IDs:

```bash
fastyclaw telegram allow 12345678 87654321
```

Pass no IDs in the allow list (or clear it via the API) to open it back
up.

The same update via `curl` looks like this:

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"allowedUserIds":[12345678,87654321]}'

curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"allowedUserIds":[]}'
```

### 6. Stopping and forgetting

```bash
fastyclaw telegram stop            # pause the poller; chats are retained
fastyclaw telegram chats           # list chat → thread mappings
fastyclaw telegram forget <chatId> # unmap a chat (thread file is kept)
```

The chat map lives at `~/.fastyclaw/telegram-chats.json`.

If you want the HTTP equivalents:

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/stop
curl -s http://127.0.0.1:5177/telegram/chats
curl -s -X DELETE http://127.0.0.1:5177/telegram/chats/<chatId>
```

### From the client SDK

```ts
import { FastyclawClient } from 'fastyclaw-client';

const client = new FastyclawClient();
await client.telegram.setToken('123456:ABC...');
await client.telegram.enable();
console.log(await client.telegram.status());
```

## WhatsApp

Expose the running agent to a WhatsApp account so you can chat with it from
your phone or a group. Each WhatsApp `jid` maps 1:1 to a persistent fastyclaw
thread, so context survives restarts.

### 1. Start the session

Make sure the server is already running (`npm start`). Then start the WhatsApp
socket:

```bash
fastyclaw whatsapp start
fastyclaw whatsapp status
```

The status response shows whether the socket is running and paired:

```json
{
  "running": true,
  "paired": false,
  "ownJid": null,
  "chatCount": 0
}
```

### 2. Pair with Linked Devices

Run the QR helper in another terminal:

```bash
fastyclaw whatsapp qr
```

If the session is not paired yet, it prints an ASCII QR code. Open WhatsApp on
your phone and scan it from `Linked Devices`.

If you prefer HTTP, poll the same data directly:

```bash
curl -s -X POST http://127.0.0.1:5177/whatsapp/start
curl -s http://127.0.0.1:5177/whatsapp/status
curl -s http://127.0.0.1:5177/whatsapp/qr
```

The QR endpoint returns `{ "qr": "<payload>" }` while pairing is in progress.

### 3. Send and receive messages

Once the device is paired, message the connected WhatsApp account from your
phone. The bot replies in the same chat, and the first message from a `jid`
creates the thread mapping automatically.

Check the current chat map with:

```bash
fastyclaw whatsapp chats
```

HTTP equivalent:

```bash
curl -s http://127.0.0.1:5177/whatsapp/chats
```

### 4. Control who can talk to it

By default, any chat can reach the agent. To whitelist specific WhatsApp jids:

```bash
fastyclaw whatsapp allow 34612345678@s.whatsapp.net
fastyclaw whatsapp allow 34612345678@s.whatsapp.net 34687654321@s.whatsapp.net
```

For groups, switch between mention-only and reply-to-every-message behavior:

```bash
fastyclaw whatsapp trigger mention
fastyclaw whatsapp trigger all
```

The same updates over HTTP go through `/whatsapp/config`:

```bash
curl -s -X POST http://127.0.0.1:5177/whatsapp/config \
  -H 'Content-Type: application/json' \
  -d '{"allowedJids":["34612345678@s.whatsapp.net"]}'

curl -s -X POST http://127.0.0.1:5177/whatsapp/config \
  -H 'Content-Type: application/json' \
  -d '{"groupTrigger":"all"}'
```

### 5. Stop, forget, or log out

```bash
fastyclaw whatsapp stop
fastyclaw whatsapp logout
fastyclaw whatsapp forget 34612345678@s.whatsapp.net
```

- `stop` pauses the socket but keeps the paired session on disk.
- `logout` clears the WhatsApp auth state and forces a fresh QR on the next start.
- `forget` removes one chat-to-thread mapping without deleting the thread itself.

HTTP equivalents:

```bash
curl -s -X POST http://127.0.0.1:5177/whatsapp/stop
curl -s -X POST http://127.0.0.1:5177/whatsapp/logout
curl -s -X DELETE http://127.0.0.1:5177/whatsapp/chats/34612345678%40s.whatsapp.net
```

### From the client SDK

```ts
import { FastyclawClient } from 'fastyclaw-client';

const client = new FastyclawClient();
await client.whatsapp.enable();
console.log(await client.whatsapp.status());
console.log(await client.whatsapp.qr());
await client.whatsapp.setAllowedJids(['34612345678@s.whatsapp.net']);
await client.whatsapp.setGroupTrigger('mention');
```

## Notes

- On a clean install, fastyclaw auto-detects the provider from env and falls
  back to OpenAI with `gpt-5.4-mini` when nothing else is configured.
- You can switch providers at any time with `fastyclaw provider set`; see the
  provider guide above for the full matrix.
- Browser tools are launched lazily, so the server can start without a browser installed, but browser actions will need a usable Chrome/Chromium setup.
