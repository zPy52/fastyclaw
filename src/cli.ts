#!/usr/bin/env node
import { FastyclawServer } from '@/server/index';
import { Const } from '@/config/index';

const argv = process.argv.slice(2);
const cmd = argv[0];

function usage(): never {
  console.error([
    'usage:',
    '  fastyclaw start [port]',
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
} else if (cmd === 'telegram') {
  handleTelegram(argv[1], argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  usage();
}
