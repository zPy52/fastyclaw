# fastyclaw-client

`fastyclaw-client` is the TypeScript SDK for a running fastyclaw server. It talks to the server over HTTP and SSE, so you can create threads, stream agent output, manage providers, and control channel integrations from any Node.js or browser app.

## Install

```bash
npm install fastyclaw-client
```

## Requirements

- Node.js `>=18`
- A running fastyclaw server
- An optional auth token if your server is protected

The SDK defaults to `http://localhost:5177`.

## Quick Start

```ts
import { FastyclawClient } from 'fastyclaw-client';

const client = new FastyclawClient({
  baseUrl: 'http://localhost:5177',
  authToken: process.env.FASTYCLAW_AUTH_TOKEN,
});

const stream = client.sendMessage('Summarize the repository layout.');

for await (const event of stream) {
  switch (event.type) {
    case 'thread':
      console.log('Thread:', event.threadId);
      break;
    case 'text-delta':
      process.stdout.write(event.delta);
      break;
    case 'tool-call':
      console.log(`\n→ ${event.name}`);
      break;
    case 'tool-result':
      console.log(`← ${JSON.stringify(event.output)}`);
      break;
    case 'error':
      console.error('Error:', event.message);
      break;
    case 'done':
      console.log('\nDone.');
      break;
  }
}
```

## What It Exports

```ts
import {
  FastyclawClient,
  FastyclawClientTelegram,
  FastyclawClientWhatsapp,
  FastyclawClientSlack,
  FastyclawClientDiscord,
  FastyclawClientProviders,
  FastyclawClientAutomations,
} from 'fastyclaw-client';
```

It also exports the main TypeScript types, including:

- `ServerEvent`
- `AppConfig`
- `ProviderId`
- `ProviderConfig`
- `CallOptions`
- `Automation`
- `CreateAutomationInput`
- channel config and status types for Telegram, WhatsApp, Slack, and Discord

## Client Overview

### `FastyclawClient`

The main entry point. It exposes:

- `createThread()`
- `deleteThread(threadId?)`
- `getConfig()`
- `resetConfig()`
- `setModel(model)`
- `setProvider(provider)`
- `setProviderOptions(options)`
- `setCallOptions(options)`
- `setCwd(cwd)`
- `sendMessage(text, { threadId? })`

It also exposes ready-made subclients:

- `client.telegram`
- `client.whatsapp`
- `client.slack`
- `client.discord`
- `client.providers`
- `client.automations`

### Streaming messages

`sendMessage()` returns an async iterable of `ServerEvent` objects.

It also exposes a `threadId` promise on the stream so you can wait for the server-assigned thread identifier as soon as the first SSE event arrives.

```ts
const stream = client.sendMessage('Hello');
const threadId = await stream.threadId;

for await (const event of stream) {
  // handle events
}
```

### Thread management

```ts
const threadId = await client.createThread();
await client.deleteThread(threadId);
await client.deleteThread(); // deletes the most recent thread, if any
```

### Config

```ts
const config = await client.getConfig();

await client.setModel('gpt-5.4-mini');
await client.setProvider({ id: 'openai' });
await client.setProviderOptions({
  openai: {
    reasoning: { effort: 'medium' },
  },
});
await client.setCallOptions({ temperature: 0.2 });
await client.setCwd('/path/to/project');

await client.resetConfig();
```

## Providers

`client.providers` lets you inspect and probe available model providers.

```ts
const providers = await client.providers.list();
const models = await client.providers.models('openai');
const probe = await client.providers.probe('anthropic', {}, 'claude-sonnet-4-5');
```

`ProviderInfo` includes whether a provider is installed and active, plus the docs URL the server uses for that provider.

## Channel Integrations

The SDK exposes one subclient per supported channel. Each one wraps the channel-specific config, status, and chat-management endpoints.

### Telegram

```ts
await client.telegram.setToken('123456:ABCDEF...');
await client.telegram.setAllowedUsers([12345678]);
await client.telegram.setGroupTrigger('mention');
await client.telegram.enable();

const status = await client.telegram.status();
const chats = await client.telegram.listChats();
```

### WhatsApp

```ts
await client.whatsapp.setAllowedJids(['34612345678@s.whatsapp.net']);
await client.whatsapp.setGroupTrigger('all');
await client.whatsapp.enable();

const qr = await client.whatsapp.qr();
const status = await client.whatsapp.status();
const chats = await client.whatsapp.listChats();
await client.whatsapp.logout();
```

### Slack

```ts
await client.slack.setBotToken('xoxb-...');
await client.slack.setAppToken('xapp-...');
await client.slack.setAllowedUsers(['U01234567']);
await client.slack.setChannelTrigger('mention');
await client.slack.enable();

const status = await client.slack.status();
const chats = await client.slack.listChats();
```

### Discord

```ts
await client.discord.setToken('Bot token here');
await client.discord.setAllowedUsers(['123456789012345678']);
await client.discord.setGroupTrigger('mention');
await client.discord.enable();

const status = await client.discord.status();
const chats = await client.discord.listChats();
```

## Automations

```ts
const automation = await client.automations.create({
  name: 'daily-digest',
  description: 'Summarize the last 24 hours of work',
  prompt: 'Review the activity from the last day and write a concise summary.',
  trigger: { kind: 'cron', expr: '0 9 * * *' },
  mode: { kind: 'fresh' },
});

const list = await client.automations.list();
const details = await client.automations.get(automation.id);
await client.automations.patch(automation.id, { enabled: false });
await client.automations.runNow(automation.id);
await client.automations.delete(automation.id);
```

## Building

```bash
cd client-sdk
npm run build
```

The package publishes only the compiled `dist/` output.

## Notes

- This package uses the browser/Node global `fetch` API.
- `sendMessage()` streams server events using Server-Sent Events.
- The SDK is thin by design: it mirrors the server HTTP API rather than introducing extra client-side state.
