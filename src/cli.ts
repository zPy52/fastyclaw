#!/usr/bin/env node
import { FastyclawServer } from '@/server/index';
import { Const } from '@/config/index';

const argv = process.argv.slice(2);
const cmd = argv[0];

function usage(): never {
  console.error([
    'usage:',
    '  fastyclaw start [port]',
    '  fastyclaw provider list',
    '  fastyclaw provider show',
    '  fastyclaw provider set <id> [--model <m>] [--key k=v ...]',
    '  fastyclaw provider models <id>',
    '  fastyclaw provider probe',
    '  fastyclaw provider option set <provider> <key> <value>',
    '  fastyclaw provider option unset <provider> <key>',
    '  fastyclaw call-option set <key> <value>',
    '  fastyclaw call-option unset <key>',
    '  fastyclaw telegram status',
    '  fastyclaw telegram set-token <token>',
    '  fastyclaw telegram allow <userId> [<userId> ...]',
    '  fastyclaw telegram trigger <mention|all>',
    '  fastyclaw telegram start',
    '  fastyclaw telegram stop',
    '  fastyclaw telegram chats',
    '  fastyclaw telegram forget <chatId>',
  ].join('\n'));
  process.exit(1);
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${Const.baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    console.error(`fastyclaw server not running — run 'fastyclaw start' first.`);
    process.exit(1);
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = (json && typeof json === 'object' && 'error' in (json as Record<string, unknown>))
      ? String((json as { error: unknown }).error)
      : text || `HTTP ${res.status}`;
    console.error(msg);
    process.exit(1);
  }
  return json;
}

function coerceValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('"')) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  return raw;
}

function parseKeyPairs(tokens: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const t of tokens) {
    const eq = t.indexOf('=');
    if (eq < 0) { console.error(`invalid --key value (expected k=v): ${t}`); process.exit(1); }
    const k = t.slice(0, eq);
    const v = t.slice(eq + 1);
    if (k.startsWith('headers.')) {
      const hk = k.slice('headers.'.length);
      const headers = (out.headers as Record<string, string> | undefined) ?? {};
      headers[hk] = v;
      out.headers = headers;
    } else {
      out[k] = coerceValue(v);
    }
  }
  return out;
}

async function handleProvider(sub: string | undefined, rest: string[]): Promise<void> {
  switch (sub) {
    case 'list': {
      const data = await request('GET', '/providers');
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'show': {
      const data = await request('GET', '/config');
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'set': {
      const id = rest[0];
      if (!id) usage();
      let model: string | undefined;
      const keyPairs: string[] = [];
      for (let i = 1; i < rest.length; i++) {
        const tok = rest[i];
        if (tok === '--model') { model = rest[++i]; continue; }
        if (tok === '--key') { keyPairs.push(rest[++i]); continue; }
        console.error(`unknown arg: ${tok}`);
        process.exit(1);
      }
      const provider: Record<string, unknown> = { id, ...parseKeyPairs(keyPairs) };
      const body: Record<string, unknown> = { provider };
      if (model) body.model = model;
      const out = await request('POST', '/config', body);
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'models': {
      const id = rest[0];
      if (!id) usage();
      const out = await request('GET', `/providers/${encodeURIComponent(id)}/models`);
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'probe': {
      const cfg = await request('GET', '/config') as { provider?: { id?: string }; model?: string };
      const id = cfg.provider?.id;
      if (!id) { console.error('no provider configured'); process.exit(1); }
      const out = await request('POST', `/providers/${encodeURIComponent(id)}/probe`, {
        settings: cfg.provider,
        model: cfg.model,
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'option': {
      const action = rest[0];
      if (action === 'set') {
        const provider = rest[1]; const key = rest[2]; const value = rest[3];
        if (!provider || !key || value === undefined) usage();
        const out = await request('POST', '/config', {
          providerOptions: { [provider]: { [key]: coerceValue(value) } },
        });
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      if (action === 'unset') {
        const provider = rest[1]; const key = rest[2];
        if (!provider || !key) usage();
        const out = await request('POST', '/config', {
          providerOptions: { [provider]: { [key]: null } },
        });
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      usage();
    }
    default:
      usage();
  }
}

async function handleCallOption(sub: string | undefined, rest: string[]): Promise<void> {
  if (sub === 'set') {
    const key = rest[0]; const value = rest[1];
    if (!key || value === undefined) usage();
    const out = await request('POST', '/config', { callOptions: { [key]: coerceValue(value) } });
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (sub === 'unset') {
    const key = rest[0];
    if (!key) usage();
    const out = await request('POST', '/config', { callOptions: { [key]: null } });
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  usage();
}

async function handleTelegram(sub: string | undefined, rest: string[]): Promise<void> {
  switch (sub) {
    case 'status': {
      const status = await request('GET', '/telegram/status');
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    case 'set-token': {
      const token = rest[0];
      if (!token) usage();
      const out = await request('POST', '/telegram/config', { token });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'allow': {
      if (rest.length === 0) usage();
      const ids = rest.map((s) => Number(s.replace(/,$/, '')));
      if (!ids.every((n) => Number.isInteger(n))) {
        console.error('userId arguments must be integers');
        process.exit(1);
      }
      const out = await request('POST', '/telegram/config', { allowedUserIds: ids });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'trigger': {
      const mode = rest[0];
      if (mode !== 'mention' && mode !== 'all') usage();
      const out = await request('POST', '/telegram/config', { groupTrigger: mode });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'start': {
      const out = await request('POST', '/telegram/start');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'stop': {
      const out = await request('POST', '/telegram/stop');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'chats': {
      const out = await request('GET', '/telegram/chats');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'forget': {
      const id = rest[0];
      if (!id) usage();
      const out = await request('DELETE', `/telegram/chats/${encodeURIComponent(id)}`);
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    default:
      usage();
  }
}

if (cmd === 'start') {
  const portArg = argv[1];
  let port: number | undefined;
  if (portArg !== undefined) {
    port = Number(portArg);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`invalid port: ${portArg}`);
      process.exit(1);
    }
  }
  FastyclawServer.start(port).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (cmd === 'provider') {
  handleProvider(argv[1], argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (cmd === 'call-option') {
  handleCallOption(argv[1], argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (cmd === 'telegram') {
  handleTelegram(argv[1], argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  usage();
}
