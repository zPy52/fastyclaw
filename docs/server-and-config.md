# Server and Config

fastyclaw runs as a local HTTP server. This document covers starting, stopping, and monitoring the server, all the CLI commands that interact with it, and the full layout of the `~/.fastyclaw/` directory.

## Starting the server

### Foreground (development)

```bash
fastyclaw start
# or equivalently:
fastyclaw server start --foreground
```

The server binds to `http://127.0.0.1:5177` and logs to stdout. Press `Ctrl-C` to stop.

### Background daemon

```bash
fastyclaw server start        # spawns a daemon, prints PID
fastyclaw server status       # show PID, port, uptime
fastyclaw server stop         # send SIGTERM to the daemon
fastyclaw server logs         # tail ~/.fastyclaw/server.log
fastyclaw server logs --err   # tail ~/.fastyclaw/server.err
```

The daemon writes its PID to `~/.fastyclaw/server.pid`. If the process dies unexpectedly, the stale PID file is cleaned up automatically on the next `start`.

## Port and host

Default: `http://127.0.0.1:5177`.

Override with environment variables:

```bash
FASTYCLAW_HOST=0.0.0.0 FASTYCLAW_PORT=8080 fastyclaw start
```

Or pass a flag:

```bash
fastyclaw start --port 8080
fastyclaw server start -p 8080
```

To expose the server's public address (e.g. behind a reverse proxy), set `FASTYCLAW_PUBLIC_URL`. This is used internally for QR codes and other URL generation:

```bash
FASTYCLAW_PUBLIC_URL=https://my.server.example.com fastyclaw start
```

## Auth

By default the API is open. To require a bearer token:

```bash
fastyclaw auth set-token mysecrettoken
fastyclaw auth status
fastyclaw auth rotate       # generate and save a new random token
fastyclaw auth disable      # remove the token requirement
```

Once a token is set, every request must include `Authorization: Bearer <token>`. The client SDK handles this automatically when you pass `authToken` to the constructor:

```ts
const client = new FastyclawClient({ authToken: 'mysecrettoken' });
```

## Config file — `~/.fastyclaw/config.json`

The config file is created on first boot and written atomically whenever you run a `fastyclaw` command that changes it. It is chmod 600 (owner-readable only).

Typical shape:

```json
{
  "authToken": null,
  "model": "gpt-5.4-mini",
  "provider": {
    "id": "openai",
    "apiKey": "sk-..."
  },
  "providerOptions": {
    "openai": {
      "reasoningEffort": "high"
    }
  },
  "callOptions": {},
  "cwd": "/Users/me/projects/my-app",
  "telegram": {
    "token": null,
    "enabled": false,
    "allowedUserIds": [],
    "groupTrigger": "mention"
  },
  "whatsapp": {
    "enabled": false,
    "allowedJids": [],
    "groupTrigger": "mention"
  },
  "slack": {
    "botToken": null,
    "appToken": null,
    "enabled": false,
    "allowedUserIds": [],
    "channelTrigger": "mention"
  },
  "discord": {
    "token": null,
    "enabled": false,
    "allowedUserIds": [],
    "groupTrigger": "mention"
  }
}
```

You can read or update any field through the API rather than editing the file directly:

```bash
curl -s http://127.0.0.1:5177/config
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/path/to/project","model":"claude-sonnet-4-5"}'
curl -s -X POST http://127.0.0.1:5177/config/reset
```

### Client SDK

```ts
const config = await client.getConfig();
await client.setConfig({ cwd: '/path/to/project' });
await client.resetConfig();
```

## Provider auto-detection

If no provider is configured, fastyclaw checks for these env vars in order on first boot:

1. `AI_GATEWAY_API_KEY` → `gateway`, model `openai/gpt-5.4-mini`
2. `ANTHROPIC_API_KEY` → `anthropic`, model `claude-sonnet-4-5`
3. `GROQ_API_KEY` → `groq`, model `llama-3.3-70b-versatile`
4. `GOOGLE_GENERATIVE_AI_API_KEY` → `google`, model `gemini-2.5-pro`
5. Otherwise → `openai`, model `gpt-5.4-mini`

The detected config is saved to disk. Later env changes do not override the saved config unless you reset it.

## Call options — `callOptions`

`callOptions` is merged into the `streamText` call verbatim. Useful for temperature, max tokens, etc.:

```bash
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"callOptions":{"temperature":0.2,"maxTokens":4096}}'
```

Remove a call option by setting it to null:

```bash
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"callOptions":{"temperature":null}}'
```

## Working directory — `cwd`

The agent's tools (shell, file read/write, file search) operate relative to the configured `cwd`. Default is the working directory of the process that first started the server.

```bash
fastyclaw config set-cwd /Users/me/projects/my-app
# or via HTTP
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/Users/me/projects/my-app"}'
```

## AGENTS.md — `~/.fastyclaw/AGENTS.md`

This file is injected at the top of the system prompt for every run. Use it to give the agent persistent context: who it is, what project it is working on, what style of output you prefer, etc.

```bash
cat > ~/.fastyclaw/AGENTS.md << 'EOF'
You are a senior TypeScript developer working on the "acme-api" project.
Always prefer async/await over callbacks.
When writing shell commands, print them before running them.
EOF
```

## `~/.fastyclaw/` directory layout

| Path | Description |
|---|---|
| `config.json` | All runtime config (provider, model, channels, options) |
| `AGENTS.md` | Persistent system prompt injected into every run |
| `threads/` | Per-conversation message history (`<uuid>.json` per thread) |
| `automations.json` | Automation definitions |
| `automations/` | Per-automation run logs |
| `telegram-chats.json` | Telegram chat ID → fastyclaw thread ID mapping |
| `whatsapp-chats.json` | WhatsApp JID → fastyclaw thread ID mapping |
| `slack-chats.json` | Slack channel ID → fastyclaw thread ID mapping |
| `discord-chats.json` | Discord channel ID → fastyclaw thread ID mapping |
| `whatsapp-auth/` | Baileys session credentials (QR pairing state) |
| `browser-profile/` | Playwright persistent browser profile |
| `server.pid` | Daemon PID (absent when stopped) |
| `server.log` | Daemon stdout |
| `server.err` | Daemon stderr |
| `state.json` | Internal daemon boot state |

## Browser config

Browser tools are launched lazily — you can start the server without Chrome installed. Relevant env vars:

| Variable | Default | Description |
|---|---|---|
| `FASTYCLAW_BROWSER_CDP_URL` | — | Connect to an existing Chrome via CDP instead of launching one |
| `FASTYCLAW_BROWSER_CHANNEL` | `chrome` | Browser channel passed to Playwright |
| `FASTYCLAW_BROWSER_HEADLESS` | `false` | Set to `true` to run headless |
| `FASTYCLAW_BROWSER_WIDTH` | `1280` | Viewport width |
| `FASTYCLAW_BROWSER_HEIGHT` | `720` | Viewport height |
| `FASTYCLAW_BROWSER_PROFILE` | `~/.fastyclaw/browser-profile` | Directory for the persistent browser profile |

## HTTP API overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/config` | Read current config (secrets masked) |
| `POST` | `/config` | Patch config fields |
| `POST` | `/config/reset` | Reset to auto-detected defaults |
| `POST` | `/threads` | Create a new empty thread |
| `DELETE` | `/threads/:id` | Delete a thread |
| `POST` | `/messages` | Send a message (SSE stream) |
| `GET` | `/providers` | List all providers |
| `GET` | `/providers/:id/models` | List models for a provider |
| `POST` | `/providers/:id/probe` | Test credentials with a one-token request |
| `GET` | `/telegram/status` | Telegram connection status |
| `POST` | `/telegram/start` | Start the Telegram poller |
| `POST` | `/telegram/stop` | Stop the Telegram poller |
| `GET` | `/whatsapp/status` | WhatsApp socket status |
| `GET` | `/whatsapp/qr` | Current QR code payload |
| `POST` | `/whatsapp/start` | Start the WhatsApp socket |
| `POST` | `/whatsapp/stop` | Stop the socket (session kept) |
| `POST` | `/whatsapp/logout` | Clear WhatsApp session |
| `GET` | `/slack/status` | Slack bot status |
| `POST` | `/slack/start` | Start the Slack bot |
| `POST` | `/slack/stop` | Stop the Slack bot |
| `GET` | `/discord/status` | Discord bot status |
| `POST` | `/discord/start` | Start the Discord bot |
| `POST` | `/discord/stop` | Stop the Discord bot |
| `GET` | `/automations` | List automations |
| `POST` | `/automations` | Create an automation |
| `GET` | `/automations/:id` | Get automation + runs |
| `PATCH` | `/automations/:id` | Update an automation |
| `DELETE` | `/automations/:id` | Delete an automation |
| `POST` | `/automations/:id/run` | Run an automation immediately |
| `POST` | `/__shutdown` | Graceful server shutdown |
