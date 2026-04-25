# server

`fastyclaw start` detaches one long-running local server into the background. There are no named agents and no multi-server configuration.

---

## Directory layout

The only server state lives directly under `~/.fastyclaw/`.

```txt
~/.fastyclaw/
├── config.json
├── AGENTS.md
├── threads/
├── telegram-chats.json
├── whatsapp-auth/
├── whatsapp-chats.json
├── slack-chats.json
├── discord-chats.json
├── browser-profile/
├── server.pid
├── server.log
├── server.err
└── state.json              # { pid, port, host, startedAt, version }
```

No migration from `~/.fastyclaw/agents/*` is required.

---

## CLI

```txt
fastyclaw start [--port|-p <port>]
fastyclaw server start [--port|-p <port>]
fastyclaw server stop
fastyclaw server status
fastyclaw server logs [--err]
```

Removed:

```txt
fastyclaw start [name]
fastyclaw start --name|-n <name>
fastyclaw server list
fastyclaw server stop [name]
fastyclaw server status [name]
fastyclaw server logs [name]
```

All request-based commands (`auth`, `provider`, `call-option`, `telegram`, `whatsapp`, `slack`, `discord`) target the single server by reading `~/.fastyclaw/state.json`.

---

## Runtime

`src/config/index.ts` exposes one fixed `Const.fastyclawDir = ~/.fastyclaw`. `Const.bind()`, `Const.name`, `Const.agentDir`, `FASTYCLAW_AGENT_NAME`, and `FASTYCLAW_AGENT_DIR` do not exist.

`src/server/daemon.ts` spawns the daemon with:

```ts
spawn(process.execPath, [process.argv[1], '__run-daemon'], {
  detached: true,
  windowsHide: true,
  stdio: ['ignore', out, err],
  env: {
    ...process.env,
    FASTYCLAW_PORT: args.port ? String(args.port) : '',
    FASTYCLAW_DAEMON: '1',
  },
});
```

`FastyclawServer.start()` writes `server.pid`, starts Express, loads all channel chat maps from `~/.fastyclaw`, applies enabled channel config, writes `state.json`, and removes `server.pid` + `state.json` during shutdown.

---

## Channels

Server channel implementations live under:

```txt
src/channels/telegram
src/channels/whatsapp
src/channels/slack
src/channels/discord
```

HTTP routes stay unchanged:

```txt
/telegram/*
/whatsapp/*
/slack/*
/discord/*
```

Client SDK modules stay in `client-sdk/src/*.ts`.

---

## Verification

```txt
npm run build
node --test scripts/*.test.mjs
fastyclaw start
fastyclaw telegram status
fastyclaw whatsapp status
fastyclaw slack status
fastyclaw discord status
fastyclaw server stop
```
