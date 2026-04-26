# Discord

Connect fastyclaw to a Discord server as a bot. Each Discord channel maps 1:1 to a persistent fastyclaw thread.

## 1. Create a Discord application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. In the sidebar, go to **Bot** and click **Add Bot**.
3. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent**
   - **Server Members Intent** (optional, for user ID filtering)
4. Copy the **Bot Token**.
5. In **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`. Under Bot Permissions select at minimum `Send Messages` and `Read Message History`. Open the generated URL to invite the bot to your server.

## 2. Register the token

```bash
fastyclaw discord set-token Bot_token_here
fastyclaw discord start
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/discord/config \
  -H 'Content-Type: application/json' \
  -d '{"token":"Bot_token_here"}'

curl -s -X POST http://127.0.0.1:5177/discord/start
```

### Client SDK

```ts
import { FastyclawClient } from 'fastyclaw-sdk';

const client = new FastyclawClient();
await client.discord.setToken('Bot_token_here');
await client.discord.enable();
```

## 3. Check status

```bash
fastyclaw discord status
```

```ts
const status = await client.discord.status();
// { running: true, botTag: 'mybot#0000', chatCount: 0 }
```

## 4. Talk to the bot

Mention the bot in any channel it has access to (`@yourbot hello`). The agent streams its reply into the same channel, with tool calls shown inline.

## 5. Group trigger

By default the bot only responds when mentioned. Switch to responding to all messages in a channel:

```bash
fastyclaw discord trigger all
fastyclaw discord trigger mention
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/discord/config \
  -H 'Content-Type: application/json' \
  -d '{"groupTrigger":"all"}'
```

### Client SDK

```ts
await client.discord.setGroupTrigger('all');
await client.discord.setGroupTrigger('mention');
```

## 6. Restrict who can talk to the bot

Whitelist specific Discord user IDs (right-click user → Copy User ID, with Developer Mode enabled in Discord settings):

```bash
fastyclaw discord allow 123456789012345678 987654321098765432
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/discord/config \
  -H 'Content-Type: application/json' \
  -d '{"allowedUserIds":["123456789012345678"]}'
```

### Client SDK

```ts
await client.discord.setAllowedUserIds(['123456789012345678']);
await client.discord.setAllowedUserIds([]); // remove restriction
```

## 7. Stop and manage chats

```bash
fastyclaw discord stop                    # disconnect; chats retained
fastyclaw discord chats                   # list channel → thread mappings
fastyclaw discord forget <channelId>      # remove one chat mapping
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/discord/stop
curl -s http://127.0.0.1:5177/discord/chats
curl -s -X DELETE http://127.0.0.1:5177/discord/chats/<channelId>
```

### Client SDK

```ts
await client.discord.disable();
const chats = await client.discord.listChats();
await client.discord.forgetChat(channelId);
```

## Storage

Chat-to-thread mappings are stored at `~/.fastyclaw/discord-chats.json`. The token is stored in `~/.fastyclaw/config.json` (chmod 600).
