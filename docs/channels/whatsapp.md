# WhatsApp

Connect fastyclaw to a WhatsApp account via Linked Devices. Each WhatsApp JID (contact or group) maps 1:1 to a persistent fastyclaw thread, so context survives restarts.

WhatsApp support is powered by [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).

## 1. Start the socket

Make sure the server is running, then:

```bash
fastyclaw whatsapp start
fastyclaw whatsapp status
```

Status before pairing:

```json
{
  "running": true,
  "paired": false,
  "ownJid": null,
  "chatCount": 0
}
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/whatsapp/start
curl -s http://127.0.0.1:5177/whatsapp/status
```

### Client SDK

```ts
import { FastyclawClient } from 'fastyclaw-client';

const client = new FastyclawClient();
await client.whatsapp.enable();
const status = await client.whatsapp.status();
```

## 2. Pair with Linked Devices

```bash
fastyclaw whatsapp qr
```

If not yet paired, this prints an ASCII QR code. Open WhatsApp on your phone → **Linked Devices** → **Link a device** → scan the code.

### Via HTTP

```bash
curl -s http://127.0.0.1:5177/whatsapp/qr
# → { "qr": "<qr-payload>" }
```

### Client SDK

```ts
const { qr } = await client.whatsapp.qr();
// render or log the QR payload
```

## 3. Start chatting

Once paired, send a message from your phone to the linked WhatsApp account. The bot replies in the same chat. The first message from any JID automatically creates a thread mapping.

View current mappings:

```bash
fastyclaw whatsapp chats
```

```bash
curl -s http://127.0.0.1:5177/whatsapp/chats
```

## 4. Restrict who can talk to the bot

By default, fastyclaw only responds to your own messages on the linked account (the "You" chat) or group messages from that account. To allow additional JIDs:

```bash
fastyclaw whatsapp allow 34612345678@s.whatsapp.net
fastyclaw whatsapp allow 34612345678@s.whatsapp.net 34687654321@s.whatsapp.net
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/whatsapp/config \
  -H 'Content-Type: application/json' \
  -d '{"allowedJids":["34612345678@s.whatsapp.net"]}'
```

### Client SDK

```ts
await client.whatsapp.setAllowedJids(['34612345678@s.whatsapp.net']);
await client.whatsapp.setAllowedJids([]); // remove restriction
```

## 5. Group trigger

In groups, the bot only responds to messages that `@mention` it by default. Switch to all messages:

```bash
fastyclaw whatsapp trigger all
fastyclaw whatsapp trigger mention
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/whatsapp/config \
  -H 'Content-Type: application/json' \
  -d '{"groupTrigger":"all"}'
```

### Client SDK

```ts
await client.whatsapp.setGroupTrigger('all');
await client.whatsapp.setGroupTrigger('mention');
```

## 6. Stop, forget, and log out

```bash
fastyclaw whatsapp stop                            # pause socket; session kept
fastyclaw whatsapp logout                          # clear session; next start needs a new QR
fastyclaw whatsapp forget 34612345678@s.whatsapp.net  # remove one chat mapping
```

### Via HTTP

```bash
curl -s -X POST http://127.0.0.1:5177/whatsapp/stop
curl -s -X POST http://127.0.0.1:5177/whatsapp/logout
curl -s -X DELETE http://127.0.0.1:5177/whatsapp/chats/34612345678%40s.whatsapp.net
```

### Client SDK

```ts
await client.whatsapp.disable();
await client.whatsapp.logout();
await client.whatsapp.forgetChat('34612345678@s.whatsapp.net');
```

## Storage

| Path | Contents |
|---|---|
| `~/.fastyclaw/whatsapp-auth/` | Baileys session credentials (QR pairing state) |
| `~/.fastyclaw/whatsapp-chats.json` | JID → fastyclaw thread ID mappings |

Deleting `whatsapp-auth/` forces a fresh QR on the next `start` — equivalent to `logout`.
