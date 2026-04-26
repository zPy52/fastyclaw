# Quickstart

Get fastyclaw running in under two minutes.

## Prerequisites

- Node.js 18 or newer
- An API key for at least one supported provider

Optional (for browser-based tools):

- A local Chrome or Chromium install
- Or a Playwright CDP endpoint via `FASTYCLAW_BROWSER_CDP_URL`

## 1. Install

```bash
npm install -g fastyclaw
```

Or as a local dev dependency:

```bash
npm install fastyclaw
```

## 2. Export a provider key

fastyclaw auto-detects the provider from your environment on first boot. Set whichever one you have:

```bash
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
# or
export GOOGLE_GENERATIVE_AI_API_KEY=...
# or
export GROQ_API_KEY=...
```

## 3. Start the server

```bash
fastyclaw start
```

The server starts on `http://127.0.0.1:5177` by default. On first boot it writes a default `~/.fastyclaw/config.json` and prints the active provider.

To start in the background as a daemon:

```bash
fastyclaw server start
fastyclaw server status
```

## 4. Send a message

### Terminal

```bash
curl -N -X POST http://127.0.0.1:5177/messages \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"text":"Say hi and tell me what directory you are running in."}'
```

The first event is always `{"type":"thread","threadId":"<uuid>"}`. After that you receive `text-delta`, `tool-call`, `tool-result`, and finally `done`.

### Client SDK

```ts
import { FastyclawClient } from 'fastyclaw-sdk';

const client = new FastyclawClient();

for await (const event of client.sendMessage('Say hi and tell me what directory you are running in.')) {
  if (event.type === 'text-delta') process.stdout.write(event.delta);
}
console.log('\nThread:', await client.sendMessage('').threadId);
```

## 5. Continue a conversation

Every message response includes the `threadId` of the conversation. Pass it back on the next turn:

### Terminal

```bash
# first turn — note the threadId in the response
curl -N -X POST http://127.0.0.1:5177/messages \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"text":"What is 2+2?"}'

# second turn
curl -N -X POST http://127.0.0.1:5177/messages \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"threadId":"<uuid-from-above>","text":"Now multiply it by 10."}'
```

### Client SDK

The SDK remembers the last threadId automatically:

```ts
import { FastyclawClient } from 'fastyclaw-sdk';

const client = new FastyclawClient();

for await (const event of client.sendMessage('What is 2+2?')) {
  if (event.type === 'text-delta') process.stdout.write(event.delta);
}

// SDK reuses the same thread automatically
for await (const event of client.sendMessage('Now multiply it by 10.')) {
  if (event.type === 'text-delta') process.stdout.write(event.delta);
}
```

## 6. Switch provider or model

```bash
fastyclaw provider list
fastyclaw provider set anthropic --model claude-sonnet-4-5 --key apiKey=$ANTHROPIC_API_KEY
fastyclaw provider probe
```

### Client SDK

```ts
await client.providers.set({
  provider: { id: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
  model: 'claude-sonnet-4-5',
});
```

See [providers/index.md](providers/index.md) for all supported providers.

## 7. Read and update config

```bash
fastyclaw provider show         # print current provider and model
curl -s http://127.0.0.1:5177/config
```

To change the working directory the agent operates in:

```bash
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/path/to/my/project"}'
```

### Client SDK

```ts
const config = await client.getConfig();
console.log(config.model, config.provider.id);

await client.setConfig({ cwd: '/path/to/my/project' });
```

## 8. Threads

Threads persist to `~/.fastyclaw/threads/<uuid>.json` and survive server restarts.

```bash
# create an empty thread explicitly
curl -s -X POST http://127.0.0.1:5177/threads
# → {"threadId":"<uuid>"}

# delete a thread
curl -s -X DELETE http://127.0.0.1:5177/threads/<uuid>
```

### Client SDK

```ts
const threadId = await client.createThread();
await client.deleteThread(threadId);
```

## Next steps

- Connect a messaging channel: [channels/telegram.md](channels/telegram.md), [channels/whatsapp.md](channels/whatsapp.md), [channels/slack.md](channels/slack.md), [channels/discord.md](channels/discord.md)
- Add custom skills: [skills.md](skills.md)
- Schedule recurring runs: [automations.md](automations.md)
- Full SDK reference: [client-sdk.md](client-sdk.md)
- Server and config deep-dive: [server-and-config.md](server-and-config.md)
