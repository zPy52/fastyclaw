#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import qrcode from 'qrcode-terminal';
import { Const } from '@/config/index';
import { parseServerArgs, printHeader, fail } from '@/cli/args';
import {
  pickFreePort,
  readState,
  spawnDaemon,
  waitForExit,
  waitForState,
} from '@/server/daemon';

const argv = process.argv.slice(2);
const cmd = argv[0];

function usage(): never {
  console.error([
    'usage:',
    '  fastyclaw start [--port|-p <port>]',
    '  fastyclaw server start [--port|-p <port>]',
    '  fastyclaw server stop',
    '  fastyclaw server status',
    '  fastyclaw server logs [--err]',
    '  fastyclaw auth status',
    '  fastyclaw auth set-token <token>',
    '  fastyclaw auth rotate',
    '  fastyclaw auth disable',
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
    '  fastyclaw whatsapp status',
    '  fastyclaw whatsapp qr',
    '  fastyclaw whatsapp start',
    '  fastyclaw whatsapp stop',
    '  fastyclaw whatsapp logout',
    '  fastyclaw whatsapp allow <jid> [<jid> ...]',
    '  fastyclaw whatsapp trigger <mention|all>',
    '  fastyclaw whatsapp chats',
    '  fastyclaw whatsapp forget <jid>',
    '  fastyclaw slack status',
    '  fastyclaw slack set-bot-token <xoxb-…>',
    '  fastyclaw slack set-app-token <xapp-…>',
    '  fastyclaw slack allow <userId> [<userId> ...]',
    '  fastyclaw slack trigger <mention|all>',
    '  fastyclaw slack start',
    '  fastyclaw slack stop',
    '  fastyclaw slack chats',
    '  fastyclaw slack forget <channelId>',
    '  fastyclaw discord status',
    '  fastyclaw discord set-token <token>',
    '  fastyclaw discord allow <userId> [<userId> ...]',
    '  fastyclaw discord trigger <mention|all>',
    '  fastyclaw discord start',
    '  fastyclaw discord stop',
    '  fastyclaw discord chats',
    '  fastyclaw discord forget <channelId>',
  ].join('\n'));
  process.exit(1);
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const state = readState();
  if (!state) {
    console.error(`fastyclaw server is not running — run 'fastyclaw start' first.`);
    process.exit(1);
  }
  Const.setPort(state.port);
  Const.host = state.host;
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  const authToken = localAuthToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${Const.baseUrl()}${path}`, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    console.error(`fastyclaw server is not reachable — run 'fastyclaw start' first.`);
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

function localAuthToken(): string | null {
  if (process.env.FASTYCLAW_AUTH_TOKEN) return process.env.FASTYCLAW_AUTH_TOKEN;
  try {
    const raw = JSON.parse(fs.readFileSync(Const.configPath, 'utf8')) as { authToken?: unknown };
    return typeof raw.authToken === 'string' && raw.authToken.length > 0 ? raw.authToken : null;
  } catch {
    return null;
  }
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

function rejectNameArgs(tokens: string[]): void {
  if (tokens.includes('--name') || tokens.includes('-n')) fail('--name/-n is no longer supported');
}

function rejectServerArgs(tokens: string[]): void {
  rejectNameArgs(tokens);
  if (tokens.length > 0) fail(`unexpected argument: ${tokens[0]}`);
}

async function handleProvider(sub: string | undefined, rest: string[]): Promise<void> {
  rejectNameArgs(rest);
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
  rejectNameArgs(rest);
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

async function handleAuth(sub: string | undefined, rest: string[]): Promise<void> {
  rejectNameArgs(rest);
  switch (sub) {
    case 'status': {
      const data = await request('GET', '/config') as { authToken?: string | null };
      console.log(JSON.stringify({ enabled: !!data.authToken, authToken: data.authToken ?? null }, null, 2));
      return;
    }
    case 'set-token': {
      const token = rest[0];
      if (!token) usage();
      const out = await request('POST', '/config', { authToken: token });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'rotate': {
      const token = randomBytes(32).toString('base64url');
      await request('POST', '/config', { authToken: token });
      console.log(token);
      return;
    }
    case 'disable': {
      const out = await request('POST', '/config', { authToken: null });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    default:
      usage();
  }
}

async function handleTelegram(sub: string | undefined, rest: string[]): Promise<void> {
  rejectNameArgs(rest);
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

dispatch().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

async function dispatch(): Promise<void> {
  if (cmd === '__run-daemon') {
    const { FastyclawServer } = await import('@/server/index');
    await FastyclawServer.start(Number(process.env.FASTYCLAW_PORT) || undefined);
    return;
  }
  if (cmd === 'start') {
    await handleStart(argv.slice(1));
    return;
  }
  if (cmd === 'server') {
    const sub = argv[1];
    if (sub === 'start') { await handleStart(argv.slice(2)); return; }
    if (sub === 'stop') { await handleServerStop(argv.slice(2)); return; }
    if (sub === 'status') { await handleServerStatus(argv.slice(2)); return; }
    if (sub === 'logs') { await handleServerLogs(argv.slice(2)); return; }
    usage();
  }
  if (cmd === 'provider') {
    await handleProvider(argv[1], argv.slice(2));
    return;
  }
  if (cmd === 'auth') {
    await handleAuth(argv[1], argv.slice(2));
    return;
  }
  if (cmd === 'call-option') {
    await handleCallOption(argv[1], argv.slice(2));
    return;
  }
  if (cmd === 'telegram') {
    await handleTelegram(argv[1], argv.slice(2));
    return;
  }
  if (cmd === 'whatsapp') {
    await handleWhatsapp(argv[1], argv.slice(2));
    return;
  }
  if (cmd === 'slack') {
    await handleSlack(argv[1], argv.slice(2));
    return;
  }
  if (cmd === 'discord') {
    await handleDiscord(argv[1], argv.slice(2));
    return;
  }
  usage();
}

async function handleStart(rest: string[]): Promise<void> {
  const { port } = parseServerArgs(rest);
  printHeader(`starting server${port ? ` on port ${port}` : ''}`);

  const existing = readState();
  if (existing) fail(`server is already running (pid ${existing.pid}, port ${existing.port})`);

  const resolvedPort = port ?? await pickFreePort(Const.DEFAULT_PORT);
  const { pid } = spawnDaemon({ port: resolvedPort });
  if (!pid) fail('failed to spawn daemon');

  const state = await waitForState(5_000);
  if (!state) fail(`daemon did not start in time - see ${Const.errPath}`);

  console.log(`fastyclaw server running on http://${state.host}:${state.port} (pid ${state.pid})`);
  console.log(`  dir:  ${Const.fastyclawDir}`);
  console.log(`  logs: ${Const.logPath}`);
}

async function handleServerStop(rest: string[]): Promise<void> {
  rejectServerArgs(rest);
  const state = readState();
  if (!state) {
    console.log('server is not running');
    return;
  }

  try {
    await fetch(`http://${state.host}:${state.port}/__shutdown`, {
      method: 'POST',
      headers: authHeader(),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Fall through to process-level shutdown.
  }

  if (await waitForExit(state.pid, 3_000)) {
    console.log('stopped server');
    return;
  }
  try { process.kill(state.pid, 'SIGTERM'); } catch { /* already gone */ }

  if (await waitForExit(state.pid, 3_000)) {
    console.log('stopped server');
    return;
  }
  try { process.kill(state.pid, 'SIGKILL'); } catch { /* ignore */ }
  console.log('force-killed server');
}

async function handleServerStatus(rest: string[]): Promise<void> {
  rejectServerArgs(rest);
  const state = readState();
  console.log(JSON.stringify(state ?? { status: 'stopped' }, null, 2));
}

async function handleServerLogs(rest: string[]): Promise<void> {
  const useErr = rest.includes('--err');
  rejectServerArgs(rest.filter((token) => token !== '--err'));
  const file = useErr ? Const.errPath : Const.logPath;
  try {
    process.stdout.write(await fsp.readFile(file, 'utf8'));
  } catch {
    fail('no logs found for server');
  }
}

function authHeader(): Record<string, string> | undefined {
  const token = localAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function handleWhatsapp(sub: string | undefined, rest: string[]): Promise<void> {
  rejectNameArgs(rest);
  switch (sub) {
    case 'status': {
      const out = await request('GET', '/whatsapp/status');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'qr': {
      for (let i = 0; i < 60; i++) {
        const status = await request('GET', '/whatsapp/status') as { paired?: boolean; running?: boolean };
        if (status.paired) { console.log('already paired'); return; }
        const body = await request('GET', '/whatsapp/qr') as { qr: string | null };
        if (body.qr) {
          qrcode.generate(body.qr, { small: true }, (ascii: string) => console.log(ascii));
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      console.error('no QR available; is whatsapp started?');
      process.exit(1);
    }
    case 'start': {
      const out = await request('POST', '/whatsapp/start');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'stop': {
      const out = await request('POST', '/whatsapp/stop');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'logout': {
      const out = await request('POST', '/whatsapp/logout');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'allow': {
      if (rest.length === 0) usage();
      const jids = rest.map((s) => s.replace(/,$/, '')).filter((s) => s.length > 0);
      const out = await request('POST', '/whatsapp/config', { allowedJids: jids });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'trigger': {
      const mode = rest[0];
      if (mode !== 'mention' && mode !== 'all') usage();
      const out = await request('POST', '/whatsapp/config', { groupTrigger: mode });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'chats': {
      const out = await request('GET', '/whatsapp/chats');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'forget': {
      const jid = rest[0];
      if (!jid) usage();
      const out = await request('DELETE', `/whatsapp/chats/${encodeURIComponent(jid)}`);
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    default:
      usage();
  }
}

async function handleSlack(sub: string | undefined, rest: string[]): Promise<void> {
  rejectNameArgs(rest);
  switch (sub) {
    case 'status': {
      const out = await request('GET', '/slack/status');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'set-bot-token': {
      const token = rest[0];
      if (!token) usage();
      const out = await request('POST', '/slack/config', { botToken: token });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'set-app-token': {
      const token = rest[0];
      if (!token) usage();
      const out = await request('POST', '/slack/config', { appToken: token });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'allow': {
      if (rest.length === 0) usage();
      const ids = rest.map((s) => s.replace(/,$/, '')).filter((s) => s.length > 0);
      const out = await request('POST', '/slack/config', { allowedUserIds: ids });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'trigger': {
      const mode = rest[0];
      if (mode !== 'mention' && mode !== 'all') usage();
      const out = await request('POST', '/slack/config', { channelTrigger: mode });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'start': {
      const out = await request('POST', '/slack/start');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'stop': {
      const out = await request('POST', '/slack/stop');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'chats': {
      const out = await request('GET', '/slack/chats');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'forget': {
      const id = rest[0];
      if (!id) usage();
      const out = await request('DELETE', `/slack/chats/${encodeURIComponent(id)}`);
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    default:
      usage();
  }
}

async function handleDiscord(sub: string | undefined, rest: string[]): Promise<void> {
  rejectNameArgs(rest);
  switch (sub) {
    case 'status': {
      const out = await request('GET', '/discord/status');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'set-token': {
      const token = rest[0];
      if (!token) usage();
      const out = await request('POST', '/discord/config', { token });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'allow': {
      if (rest.length === 0) usage();
      const ids = rest.map((s) => s.replace(/,$/, '')).filter((s) => s.length > 0);
      const out = await request('POST', '/discord/config', { allowedUserIds: ids });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'trigger': {
      const mode = rest[0];
      if (mode !== 'mention' && mode !== 'all') usage();
      const out = await request('POST', '/discord/config', { groupTrigger: mode });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'start': {
      const out = await request('POST', '/discord/start');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'stop': {
      const out = await request('POST', '/discord/stop');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'chats': {
      const out = await request('GET', '/discord/chats');
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'forget': {
      const id = rest[0];
      if (!id) usage();
      const out = await request('DELETE', `/discord/chats/${encodeURIComponent(id)}`);
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    default:
      usage();
  }
}
