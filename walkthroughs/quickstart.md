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

If you want a different port, set:

```bash
FASTYCLAW_PORT=6000 npm start
```

## Smoke test

Create a session:

```bash
curl -s -X POST http://127.0.0.1:5177/sessions
```

Then send a message with the returned `sessionId`:

```bash
curl -N -X POST http://127.0.0.1:5177/sessions/<sessionId>/messages \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"text":"Say hello and tell me the current working directory."}'
```

You can also update the session config first:

```bash
curl -X POST http://127.0.0.1:5177/sessions/<sessionId>/config \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.4-mini","cwd":"."}'
```

Delete the session when you are done:

```bash
curl -X DELETE http://127.0.0.1:5177/sessions/<sessionId>
```

## Notes

- The default model is `gpt-5.4-mini`.
- Only the `openai` provider is supported right now.
- Browser tools are launched lazily, so the server can start without a browser installed, but browser actions will need a usable Chrome/Chromium setup.
