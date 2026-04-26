# Client SDK

`fastyclaw-sdk` is a TypeScript SDK for talking to a running fastyclaw server over HTTP and SSE. Install it in any Node.js or browser project and drive the agent without touching a shell.

## Install

```bash
npm install fastyclaw-sdk
```

## Connect

```ts
import { FastyclawClient } from 'fastyclaw-sdk';

// Defaults to http://localhost:5177
const client = new FastyclawClient();

// Custom server or auth token
const client = new FastyclawClient({
  baseUrl: 'http://192.168.1.10:5177',
  authToken: 'mysecrettoken',
});
```

## Sending messages

`sendMessage` returns an async iterable of `ServerEvent` objects and resolves the thread ID on the first event.

```ts
for await (const event of client.sendMessage('List the files in the current directory.')) {
  switch (event.type) {
    case 'thread':
      console.log('Thread:', event.threadId);
      break;
    case 'text-delta':
      process.stdout.write(event.delta);
      break;
    case 'tool-call':
      console.log(`\n→ ${event.name}(${JSON.stringify(event.input)})`);
      break;
    case 'tool-result':
      console.log(`← ${event.output}`);
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

### Continuing a thread

The client remembers the last thread ID. Pass it explicitly to keep a conversation going, or let the SDK reuse it automatically:

```ts
// First turn — SDK assigns a new thread
for await (const event of client.sendMessage('What is Node.js?')) { ... }

// Second turn — SDK reuses the same thread
for await (const event of client.sendMessage('Give me a code example.')) { ... }

// Or pin a specific thread explicitly
for await (const event of client.sendMessage('Continue.', { threadId: 'my-uuid' })) { ... }
```

### Getting the thread ID

```ts
const stream = client.sendMessage('Hello');
const threadId = await stream.threadId; // resolves after the first SSE event

for await (const event of stream) { ... }

// Or read it from the client after the stream finishes
console.log(client.threadId);
```

## Thread management

```ts
// Create an empty thread
const threadId = await client.createThread();

// Delete a thread (removes the file from ~/.fastyclaw/threads/)
await client.deleteThread(threadId);

// Delete the last active thread
await client.deleteThread();
```

## Config

```ts
// Read the full config (secrets are masked)
const config = await client.getConfig();
console.log(config.model, config.provider.id, config.cwd);

// Update fields
await client.setConfig({ cwd: '/path/to/project' });
await client.setConfig({ model: 'gpt-5.4-mini' });

// Reset to auto-detected defaults
await client.resetConfig();
```

## Providers

```ts
// List all supported providers with install / active status
const providers = await client.providers.list();

// Switch provider and model
await client.providers.set({
  provider: { id: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
  model: 'claude-sonnet-4-5',
});

// Set provider-specific options (passed through to streamText)
await client.providers.setOptions('anthropic', {
  thinking: { type: 'enabled', budgetTokens: 10000 },
});

// Remove a specific option
await client.providers.unsetOption('anthropic', 'thinking');

// Probe the current provider with a one-token request
await client.providers.probe();

// List live model IDs (OpenAI, Anthropic, Groq, Ollama)
const models = await client.providers.listModels('openai');
```

## Telegram

```ts
await client.telegram.setToken('123456:ABCdef...');
await client.telegram.enable();
await client.telegram.disable();

const status = await client.telegram.status();
// { running: true, botUsername: 'my_bot', chatCount: 2 }

await client.telegram.setAllowedUserIds([12345678, 87654321]);
await client.telegram.setGroupTrigger('mention'); // or 'all'

const chats = await client.telegram.listChats();
await client.telegram.forgetChat(chatId);
```

## WhatsApp

```ts
await client.whatsapp.enable();
await client.whatsapp.disable();

const status = await client.whatsapp.status();
// { running: true, paired: true, ownJid: '34612345678@s.whatsapp.net', chatCount: 3 }

const qr = await client.whatsapp.qr();
// { qr: '<qr-payload>' } while pairing is pending

await client.whatsapp.setAllowedJids(['34612345678@s.whatsapp.net']);
await client.whatsapp.setGroupTrigger('all');
await client.whatsapp.logout();

const chats = await client.whatsapp.listChats();
await client.whatsapp.forgetChat('34612345678@s.whatsapp.net');
```

## Slack

```ts
await client.slack.setBotToken('xoxb-...');
await client.slack.setAppToken('xapp-...');
await client.slack.enable();
await client.slack.disable();

const status = await client.slack.status();
await client.slack.setAllowedUserIds(['U01234567', 'U07654321']);
await client.slack.setChannelTrigger('mention'); // or 'all'

const chats = await client.slack.listChats();
await client.slack.forgetChat(channelId);
```

## Discord

```ts
await client.discord.setToken('Bot token here');
await client.discord.enable();
await client.discord.disable();

const status = await client.discord.status();
await client.discord.setAllowedUserIds(['123456789012345678']);
await client.discord.setGroupTrigger('mention'); // or 'all'

const chats = await client.discord.listChats();
await client.discord.forgetChat(channelId);
```

## Automations

```ts
import type { CreateAutomationInput } from 'fastyclaw-sdk';

// Create an automation
const automation = await client.automations.create({
  name: 'daily-digest',
  description: 'Summarise the git log every morning',
  prompt: 'Run git log --since=24h and write a bullet-point summary.',
  trigger: { kind: 'cron', expr: '0 9 * * *' },
} satisfies CreateAutomationInput);

console.log(automation.id);

// List all automations
const list = await client.automations.list();

// Get one automation and its run history
const { automation, runs } = await client.automations.get(automation.id);

// Enable / disable
await client.automations.patch(automation.id, { enabled: false });

// Run immediately (regardless of schedule)
const { runId, threadId } = await client.automations.runNow(automation.id);

// Delete
await client.automations.delete(automation.id);
```

## ServerEvent types

| `type` | Fields | Description |
|---|---|---|
| `thread` | `threadId: string` | Emitted once at the start; identifies the conversation |
| `text-delta` | `delta: string` | Incremental text from the model |
| `tool-call` | `toolCallId`, `name`, `input` | The agent is invoking a tool |
| `tool-result` | `toolCallId`, `output` | Tool response returned to the model |
| `error` | `message: string` | Non-fatal error (tool failure, etc.) |
| `done` | — | Stream is complete |

## TypeScript types

All types are exported from `fastyclaw-sdk`:

```ts
import type {
  ServerEvent,
  AppConfig,
  ProviderConfig,
  ProviderId,
  Automation,
  CreateAutomationInput,
  TelegramConfig,
  WhatsappConfig,
  SlackConfig,
  DiscordConfig,
} from 'fastyclaw-sdk';
```
