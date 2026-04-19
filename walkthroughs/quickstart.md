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

## Notes

- The default model is `gpt-5.4-mini`.
- Only the `openai` provider is supported right now.
- Browser tools are launched lazily, so the server can start without a browser installed, but browser actions will need a usable Chrome/Chromium setup.
