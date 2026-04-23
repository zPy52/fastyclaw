# tls-vps

Deploy fastyclaw on a public VPS with TLS terminating at a Caddy reverse proxy so remote SDK clients talk to the Express server over HTTPS, and add a shared-secret bearer token so TLS isn't the only thing standing between the internet and `/messages`.

The Express server stays bound to `127.0.0.1` — Caddy is the only process listening on `:443`. Channel integrations (Telegram/Slack/Discord/WhatsApp) are out of scope: their SDKs already use TLS to their own backends and don't expose anything on the VPS.

---

## Threat model

| Threat | Mitigation |
|---|---|
| MITM on SDK ↔ server wire | Caddy TLS 1.3 with Let's Encrypt cert |
| Anyone with the hostname calling `/messages` | `Authorization: Bearer <token>` check on every route |
| Cert expiry | Caddy auto-renews (ACME) |
| Port 5177 exposed directly | Keep Express bound to `127.0.0.1`; VPS firewall allows only 22/80/443 |
| Token leaked in logs | Never log the `Authorization` header; token stored in `~/.fastyclaw/config.json` with 0600 perms |

---

## Server changes

### 1. Bearer-token auth middleware

New field in `AppConfig` (`src/server/types.ts`):

```ts
export interface AppConfig {
  // ...existing fields...
  authToken: string | null;   // null = auth disabled (loopback-only dev mode)
}
```

`AppConfigPatch` gets `authToken?: string | null`. `getMasked()` replaces it with `maskSecret()`. `Const.configPath` is written with `fs.writeFileSync(CONFIG_PATH, ..., { mode: 0o600 })`.

New middleware mounted **before** any route in [src/server/routes.ts:34](src/server/routes.ts:34):

```ts
// src/server/auth.ts
export function bearerAuth(config: AppConfigStore) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = config.get().authToken;
    if (!expected) { next(); return; }                        // loopback dev mode
    const header = req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/.exec(header);
    if (!m || !timingSafeEqual(m[1], expected)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
}
```

`timingSafeEqual` uses `crypto.timingSafeEqual` on equal-length `Buffer`s (pad the shorter side first). Mount in [src/server/index.ts:44](src/server/index.ts:44):

```ts
app.use(bearerAuth(FastyclawServer.config));
FastyclawServer.routes.mount(app);
```

### 2. Bind host / port via env, keep default loopback

[src/config/index.ts:70-72](src/config/index.ts:70):

```ts
public static readonly DEFAULT_PORT: number = Number(process.env.FASTYCLAW_PORT ?? 5177);
public static readonly host: string = process.env.FASTYCLAW_HOST ?? '127.0.0.1';
public static readonly publicBaseUrl: string = process.env.FASTYCLAW_PUBLIC_URL ?? `http://localhost:${Const.DEFAULT_PORT}`;
```

`baseUrl` stays `http://localhost:${port}` for the CLI (CLI always runs on the same host). `publicBaseUrl` is only used in status logs so the admin sees the external URL.

### 3. CLI: `fastyclaw auth ...`

Add to [src/cli.ts](src/cli.ts) usage:

```
fastyclaw auth status
fastyclaw auth set-token <token>
fastyclaw auth rotate             # generates 32-byte base64url
fastyclaw auth disable
```

Handler calls `POST /config` with `{ authToken: <v> | null }`. `rotate` generates with `crypto.randomBytes(32).toString('base64url')` and prints it **once**.

---

## Client SDK changes

[client-sdk/src/client.ts:35-42](client-sdk/src/client.ts:35) — accept a token, inject on every `fetch`:

```ts
export interface FastyclawClientOptions {
  baseUrl?: string;
  authToken?: string;
}

export class FastyclawClient {
  private readonly baseUrl: string;
  private readonly authHeaders: Record<string, string>;
  public constructor(opts?: FastyclawClientOptions) {
    this.baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
    this.authHeaders = opts?.authToken ? { Authorization: `Bearer ${opts.authToken}` } : {};
    // pass this.authHeaders into the sub-clients (telegram/whatsapp/slack/discord/providers)
  }
}
```

Every `fetch` call in `client-sdk/src/*.ts` merges `this.authHeaders` into `headers`. The sub-client constructors take a second `authHeaders` arg. Update `FastyclawClientOptions` in `client-sdk/src/types.ts`.

The CLI itself continues to hit `http://localhost:5177` without a token when running on the VPS (loopback bypass is fine because `bearerAuth` only requires the token when one is configured; to require it for CLI too, pipe `FASTYCLAW_AUTH_TOKEN` from `~/.fastyclaw/config.json` into the CLI `request()` helper — optional, see the fallback section).

---

## VPS topology

```
internet ──► :443 Caddy ──► 127.0.0.1:5177 Express (fastyclaw)
              │
              └─ auto-cert via Let's Encrypt (HTTP-01 on :80)
```

Firewall (ufw):

```
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Caddyfile (`/etc/caddy/Caddyfile`)

```
fastyclaw.example.com {
    encode zstd gzip

    # SSE needs no buffering and a long read timeout
    reverse_proxy 127.0.0.1:5177 {
        flush_interval -1
        transport http {
            read_timeout  24h
            write_timeout 24h
        }
    }

    # Strip Caddy's defaults that break text/event-stream
    header {
        Cache-Control "no-cache"
        X-Accel-Buffering "no"
        -Server
    }

    request_body {
        max_size 4MB       # match express.json({ limit: '4mb' })
    }

    log {
        output file /var/log/caddy/fastyclaw.log
        format json
    }
}
```

Caddy requests and renews the Let's Encrypt cert on first start; no `certbot` command needed. DNS A-record `fastyclaw.example.com → <vps-ip>` must exist before `caddy reload`.

### systemd unit (`/etc/systemd/system/fastyclaw.service`)

```ini
[Unit]
Description=fastyclaw agent server
After=network.target

[Service]
Type=simple
User=fastyclaw
Environment=NODE_ENV=production
Environment=FASTYCLAW_HOST=127.0.0.1
Environment=FASTYCLAW_PORT=5177
Environment=FASTYCLAW_PUBLIC_URL=https://fastyclaw.example.com
EnvironmentFile=-/etc/fastyclaw/env       # API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, ...)
ExecStart=/usr/bin/fastyclaw start
Restart=on-failure
RestartSec=3
# hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/fastyclaw/.fastyclaw
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`/etc/fastyclaw/env` is `0600 root:root`; holds provider API keys only.

---

## Deployment workflow

```bash
# one-time, as root on the VPS
apt install -y caddy nodejs npm
useradd -m -s /bin/bash fastyclaw
sudo -u fastyclaw npm i -g fastyclaw

# DNS must already point to this VPS
$EDITOR /etc/caddy/Caddyfile
systemctl reload caddy                    # triggers ACME issuance

# generate and store the shared secret
sudo -u fastyclaw fastyclaw start &        # first run writes ~/.fastyclaw/config.json
sudo -u fastyclaw fastyclaw auth rotate    # prints the token — copy it to client devs
systemctl enable --now fastyclaw
```

Client side:

```ts
const client = new FastyclawClient({
  baseUrl: 'https://fastyclaw.example.com',
  authToken: process.env.FASTYCLAW_TOKEN,
});
```

---

## Verification

| Check | Command | Expected |
|---|---|---|
| TLS cert valid | `curl -vI https://fastyclaw.example.com/config` | `TLS 1.3`, valid cert, `401` JSON |
| Auth enforced | `curl https://…/config` | `{"error":"unauthorized"}` |
| Auth ok | `curl -H "Authorization: Bearer $T" https://…/config` | masked `AppConfig` JSON |
| Direct 5177 blocked | `curl http://<vps-ip>:5177/config` from outside | connection refused / timeout |
| SSE works through proxy | SDK `sendMessage('ping')` | streamed `ServerEvent`s arrive |
| Cert renews | `journalctl -u caddy -f` around day-60 | `certificate obtained` log line |

---

## What we are **not** doing (and why)

- **Not** running certbot directly against Node's `https.createServer`. Caddy handles ACME, renewals, OCSP stapling, and HTTP/2 with zero config — reimplementing it in-process is pure regression.
- **Not** terminating TLS in Express. Node can do it, but key rotation, HTTP→HTTPS redirect, and HTTP/2 coalescing all cost more than the proxy hop saves.
- **Not** adding mTLS. Shared-secret bearer over TLS is sufficient for the "prevent MITM + authenticate caller" goal. Revisit if the threat model grows to multi-tenant.
- **Not** changing channel transports. Telegram/Slack/Discord/WhatsApp are already TLS end-to-end via their SDKs.
