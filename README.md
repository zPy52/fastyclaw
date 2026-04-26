# fastyclaw

<p align="center">
  <img src="https://i.imgur.com/KnO9kl4.png" alt="fastyclaw logo" width="720" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/fastyclaw">
    <img src="https://img.shields.io/npm/v/fastyclaw?style=flat-square" alt="npm version" />
  </a>
  <a href="https://github.com/zPy52/fastyclaw">
    <img src="https://img.shields.io/badge/github-fastyclaw-181717?style=flat-square&logo=github" alt="GitHub repository" />
  </a>
  <a href="https://github.com/zPy52/fastyclaw/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/zPy52/fastyclaw?style=flat-square" alt="MIT license" />
  </a>
</p>

A small, fast local AI agent server with HTTP/SSE transport, a full tool-call loop, and a proper TypeScript client SDK. Run it once, talk to it from anywhere — your terminal, a script, a WhatsApp message, a Telegram bot, a Slack channel, or a Discord server.

## Why not just use OpenClaw?

OpenClaw is the obvious alternative. It's also the reason fastyclaw exists. Here are the four problems it doesn't solve:

**1. No SDK — you have to SSH your way to an API.**
OpenClaw has no client SDK. If you want to drive it programmatically you end up shelling out from your code, scraping stdout, or SSHing into the box it runs on. fastyclaw ships a first-class TypeScript SDK (`fastyclaw-sdk`) that lets you connect, send messages, stream responses, manage providers, configure channels, and schedule automations — all from normal code.

**2. It's painfully slow.**
Even basic commands can take 4–6 seconds to even start processing. For messaging channels the lag can be so bad that responses don't land for a minute or more. fastyclaw is built on the Vercel AI SDK's `streamText`, so the first token hits the wire the moment the model starts generating. No polling, no batching, no mystery delay.

**3. It's enormous.**
OpenClaw ships ~400K lines of code. fastyclaw has ~7.3K lines across its entire `src/` directory. A smaller codebase means:
- faster installs
- less disk space
- easier to read and audit (fewer lines to review for security)
- simpler to fork and adapt
- fewer places for bugs to hide

**4. Unnecessary files everywhere.**
OpenClaw bundles a `SOUL.md`, a `USER.md`, an `AGENTS.md`, and a small library's worth of other meta-files. fastyclaw consolidates everything the agent needs to know into a single `AGENTS.md` at `~/.fastyclaw/AGENTS.md`.

## Install

```bash
npm install -g fastyclaw
```

Or add it as a local dependency in a project that drives it via the SDK:

```bash
npm install fastyclaw
npm install fastyclaw-sdk   # TypeScript client SDK — separate package
```

Node.js 18 or newer is required.

## Quickstart

### 1. Set a provider key

fastyclaw auto-detects your provider from env on first boot. Just export one of:

```bash
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
# or
export GOOGLE_GENERATIVE_AI_API_KEY=...
# or
export GROQ_API_KEY=...
```

### 2. Start the server

```bash
fastyclaw start
```

The server listens on `http://127.0.0.1:5177` by default. Config and state are written to `~/.fastyclaw/`.

### 3. Send a message

```bash
curl -N -X POST http://127.0.0.1:5177/messages \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"text":"What files are in the current directory?"}'
```

Or from the SDK:

```ts
import { FastyclawClient } from 'fastyclaw-sdk';

const client = new FastyclawClient();
for await (const event of client.sendMessage('What files are in the current directory?')) {
  if (event.type === 'text-delta') process.stdout.write(event.delta);
}
```

## Server management

```bash
fastyclaw server start          # start as a background daemon
fastyclaw server stop           # stop the daemon
fastyclaw server status         # print pid, port, uptime
fastyclaw server logs           # tail stdout log
fastyclaw server logs --err     # tail stderr log
```

## Providers

fastyclaw is built on the [Vercel AI SDK](https://sdk.vercel.ai) and supports every provider it does: OpenAI, Anthropic, Google, Groq, Mistral, xAI, DeepSeek, Perplexity, Cohere, Together AI, Fireworks, Cerebras, Amazon Bedrock, Azure OpenAI, Google Vertex, OpenAI-compatible endpoints, OpenRouter, and local runtimes like Ollama, Claude Code CLI, Codex CLI, and Gemini CLI.

```bash
fastyclaw provider list
fastyclaw provider set anthropic --model claude-sonnet-4-5 --key apiKey=$ANTHROPIC_API_KEY
fastyclaw provider probe
```

See [docs/providers/index.md](docs/providers/index.md) for the full reference.

## Messaging channels

Connect the agent to any combination of channels — each chat maps 1:1 to a persistent conversation thread so context survives restarts.

| Channel | Docs |
|---|---|
| Telegram | [docs/channels/telegram.md](docs/channels/telegram.md) |
| WhatsApp | [docs/channels/whatsapp.md](docs/channels/whatsapp.md) |
| Slack | [docs/channels/slack.md](docs/channels/slack.md) |
| Discord | [docs/channels/discord.md](docs/channels/discord.md) |

## Automations

Schedule recurring or one-off agent runs using cron expressions, fixed intervals, or exact timestamps:

```bash
fastyclaw automation create \
  --name "daily-digest" \
  --prompt "Summarise the git log from the last 24 hours and email it." \
  --cron "0 9 * * *"
```

See [docs/automations.md](docs/automations.md).

## Skills

Drop a `SKILL.md` file into `~/.agents/skills/<skill-name>/` and the agent loads it automatically as an injectable system-prompt fragment. Useful for giving the agent domain knowledge, personas, or specialised instructions without touching the server config.

See [docs/skills.md](docs/skills.md).

## Auth

The HTTP API is open by default. To lock it down:

```bash
fastyclaw auth set-token mysecrettoken
```

All subsequent requests must include `Authorization: Bearer mysecrettoken`. Rotate or disable at any time:

```bash
fastyclaw auth rotate
fastyclaw auth disable
```

## Configuration files

Everything lives under `~/.fastyclaw/`:

| Path | Contents |
|---|---|
| `config.json` | Active provider, model, channel configs, call options |
| `AGENTS.md` | System prompt injected at the top of every run |
| `threads/` | Per-conversation message history |
| `automations.json` | Saved automation definitions |
| `automations/` | Per-automation run logs |
| `telegram-chats.json` | Telegram chat → thread mappings |
| `whatsapp-chats.json` | WhatsApp JID → thread mappings |
| `slack-chats.json` | Slack channel → thread mappings |
| `discord-chats.json` | Discord channel → thread mappings |
| `whatsapp-auth/` | WhatsApp session credentials |
| `browser-profile/` | Playwright browser state |
| `server.pid` | Daemon PID |
| `server.log` / `server.err` | Daemon log files |

See [docs/server-and-config.md](docs/server-and-config.md) for the full breakdown.

## Documentation

| File | Topic |
|---|---|
| [docs/quickstart.md](docs/quickstart.md) | Install, first run, smoke tests |
| [docs/client-sdk.md](docs/client-sdk.md) | TypeScript SDK reference |
| [docs/automations.md](docs/automations.md) | Scheduling recurring agent runs |
| [docs/server-and-config.md](docs/server-and-config.md) | Server, daemon, config files |
| [docs/skills.md](docs/skills.md) | Custom skill loading |
| [docs/providers/index.md](docs/providers/index.md) | All supported AI providers |
| [docs/channels/telegram.md](docs/channels/telegram.md) | Telegram bot setup |
| [docs/channels/whatsapp.md](docs/channels/whatsapp.md) | WhatsApp setup |
| [docs/channels/slack.md](docs/channels/slack.md) | Slack bot setup |
| [docs/channels/discord.md](docs/channels/discord.md) | Discord bot setup |
| [docs/tools/browser.md](docs/tools/browser.md) | Browser tool reference |

## License

MIT
