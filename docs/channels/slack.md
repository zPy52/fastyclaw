# Slack

Connect fastyclaw to a Slack workspace as a bot. Each Slack channel (or DM thread) maps 1:1 to a persistent fastyclaw thread.

## 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**.
2. Under **OAuth & Permissions**, add these bot token scopes:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`
3. Under **Event Subscriptions**, enable events and subscribe to:
   - `app_mention`
   - `message.channels`
   - `message.groups`
   - `message.im`
   - `message.mpim`
4. Under **Socket Mode**, enable Socket Mode and generate an **App-Level Token** with `connections:write` scope.
5. Install the app to your workspace and copy:
   - **Bot User OAuth Token** (starts with `xoxb-`)
   - **App-Level Token** (starts with `xapp-`)

## 2. Register tokens

```bash
fastyclaw slack set-bot-token xoxb-...
fastyclaw slack set-app-token xapp-...
fastyclaw slack start
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/slack/config \
  -H 'Content-Type: application/json' \
  -d '{"botToken":"xoxb-...","appToken":"xapp-..."}'

curl -s -X POST http://127.0.0.1:5177/slack/start
```

### Client SDK

```ts
import { FastyclawClient } from 'fastyclaw-sdk';

const client = new FastyclawClient();
await client.slack.setBotToken('xoxb-...');
await client.slack.setAppToken('xapp-...');
await client.slack.enable();
```

## 3. Check status

```bash
fastyclaw slack status
```

```ts
const status = await client.slack.status();
// { running: true, botUserId: 'U...', chatCount: 0 }
```

## 4. Talk to the bot

Invite the bot to a channel (`/invite @yourbot`), then `@mention` it. Or DM the bot directly. The agent streams its reply as a Slack message, with tool calls shown inline.

## 5. Channel trigger

By default the bot only responds when mentioned. Switch to all messages in a channel:

```bash
fastyclaw slack trigger all
fastyclaw slack trigger mention
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/slack/config \
  -H 'Content-Type: application/json' \
  -d '{"channelTrigger":"all"}'
```

### Client SDK

```ts
await client.slack.setChannelTrigger('all');
await client.slack.setChannelTrigger('mention');
```

## 6. Restrict who can talk to the bot

By default anyone in the workspace can trigger the bot. Whitelist specific Slack user IDs (visible via profile → `More` → Copy member ID):

```bash
fastyclaw slack allow U01234567 U07654321
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/slack/config \
  -H 'Content-Type: application/json' \
  -d '{"allowedUserIds":["U01234567","U07654321"]}'
```

### Client SDK

```ts
await client.slack.setAllowedUserIds(['U01234567', 'U07654321']);
await client.slack.setAllowedUserIds([]); // remove restriction
```

## 7. Stop and manage chats

```bash
fastyclaw slack stop                      # disconnect; chats retained
fastyclaw slack chats                     # list channel → thread mappings
fastyclaw slack forget <channelId>        # remove one chat mapping
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/slack/stop
curl -s http://127.0.0.1:5177/slack/chats
curl -s -X DELETE http://127.0.0.1:5177/slack/chats/<channelId>
```

### Client SDK

```ts
await client.slack.disable();
const chats = await client.slack.listChats();
await client.slack.forgetChat(channelId);
```

## Storage

Chat-to-thread mappings are stored at `~/.fastyclaw/slack-chats.json`. Tokens are stored in `~/.fastyclaw/config.json` (chmod 600).
