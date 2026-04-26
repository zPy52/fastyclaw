# Telegram

Connect fastyclaw to a Telegram bot so you can chat with it from your phone or a group. Each Telegram chat maps 1:1 to a persistent fastyclaw thread, so context survives restarts.

## 1. Create a bot

Message [@BotFather](https://t.me/BotFather) on Telegram and run `/newbot`. Pick a name and username; BotFather replies with a token like `123456:ABCdef...`.

For groups, also send `/setprivacy` → pick your bot → `Disable`, so it can see non-command messages.

## 2. Register the token

Make sure the server is running, then in another terminal:

```bash
fastyclaw telegram set-token 123456:ABCdef...
fastyclaw telegram start
```

`set-token` writes to `~/.fastyclaw/config.json`; `start` launches the long-polling loop.

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"token":"123456:ABCdef..."}'

curl -s -X POST http://127.0.0.1:5177/telegram/start
```

### Client SDK

```ts
import { FastyclawClient } from 'fastyclaw-client';

const client = new FastyclawClient();
await client.telegram.setToken('123456:ABCdef...');
await client.telegram.enable();
```

## 3. Check status

```bash
fastyclaw telegram status
```

```bash
curl -s http://127.0.0.1:5177/telegram/status
```

```ts
const status = await client.telegram.status();
// { running: true, botUsername: 'my_bot', chatCount: 0 }
```

## 4. Send a message

Open Telegram, find your bot by `@username`, and send any message. The agent streams its reply back, with tool calls shown as compact `🔧 name(...)` lines.

## 5. Groups

Add the bot to a group. By default it only responds when:

- the message `@mentions` it,
- the message is a reply to one of its own messages, or
- the message starts with `/ask`.

Switch to responding to every message:

```bash
fastyclaw telegram trigger all
```

Back to mention-only:

```bash
fastyclaw telegram trigger mention
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"groupTrigger":"all"}'
```

### Client SDK

```ts
await client.telegram.setGroupTrigger('all');
await client.telegram.setGroupTrigger('mention');
```

## 6. Restrict who can talk to the bot

By default anyone who can DM the bot gets a response. Whitelist specific Telegram user IDs:

```bash
fastyclaw telegram allow 12345678 87654321
```

Pass an empty list to open it back up:

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"allowedUserIds":[]}'
```

### Client SDK

```ts
await client.telegram.setAllowedUserIds([12345678, 87654321]);
await client.telegram.setAllowedUserIds([]); // remove restriction
```

## 7. Stop and manage chats

```bash
fastyclaw telegram stop              # pause the poller; chats and threads are kept
fastyclaw telegram chats             # list chat → thread mappings
fastyclaw telegram forget <chatId>   # remove a chat mapping (thread file is kept)
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/telegram/stop
curl -s http://127.0.0.1:5177/telegram/chats
curl -s -X DELETE http://127.0.0.1:5177/telegram/chats/<chatId>
```

### Client SDK

```ts
await client.telegram.disable();
const chats = await client.telegram.listChats();
await client.telegram.forgetChat(chatId);
```

## Storage

Chat-to-thread mappings live at `~/.fastyclaw/telegram-chats.json`. The token is stored in `~/.fastyclaw/config.json` (chmod 600).
