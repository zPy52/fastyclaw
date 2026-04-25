import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

async function withTempHome(fn) {
  const priorHome = process.env.HOME;
  const priorUserProfile = process.env.USERPROFILE;
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'fastyclaw-auth-'));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await fn(home);
  } finally {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
    if (priorUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = priorUserProfile;
    await fsp.rm(home, { recursive: true, force: true });
  }
}

test('config stores authToken with 0600 permissions and masks it from public config', async () => {
  await withTempHome(async (home) => {
    const { AppConfigStore, Const } = await import(`../dist/config/index.js?auth=${Date.now()}`);
    const store = new AppConfigStore();

    assert.equal(store.get().authToken, null);

    store.patch({ authToken: 'secret-token-123456' });

    const raw = JSON.parse(await fsp.readFile(path.join(home, '.fastyclaw', 'config.json'), 'utf8'));
    assert.equal(raw.authToken, 'secret-token-123456');
    assert.equal(store.getMasked().authToken, 'sec…3456');
    assert.equal(Const.configPath, path.join(home, '.fastyclaw', 'config.json'));
    assert.equal(fs.statSync(Const.configPath).mode & 0o777, 0o600);
  });
});

test('Const uses the single fastyclaw root directory', async () => {
  await withTempHome(async (home) => {
    const { Const } = await import(`../dist/config/index.js?agent=${Date.now()}`);

    const rootDir = path.join(home, '.fastyclaw');
    assert.equal(Const.fastyclawDir, rootDir);
    assert.equal(Const.configPath, path.join(rootDir, 'config.json'));
    assert.equal(Const.threadsDir, path.join(rootDir, 'threads'));
    assert.equal(Const.telegramChatsPath, path.join(rootDir, 'telegram-chats.json'));
    assert.equal(Const.whatsappAuthDir, path.join(rootDir, 'whatsapp-auth'));
    assert.equal(Const.browserProfileDir, path.join(rootDir, 'browser-profile'));
    assert.equal(Const.pidPath, path.join(rootDir, 'server.pid'));
    assert.equal(Const.logPath, path.join(rootDir, 'server.log'));
    assert.equal(Const.errPath, path.join(rootDir, 'server.err'));
    assert.equal(Const.statePath, path.join(rootDir, 'state.json'));
  });
});

test('parseServerArgs supports only port configuration', async () => {
  const { parseServerArgs } = await import(`../dist/cli/args.js?args=${Date.now()}`);

  assert.deepEqual(parseServerArgs([]), { port: undefined });
  assert.deepEqual(parseServerArgs(['-p', '4132']), { port: 4132 });
  assert.deepEqual(parseServerArgs(['--port', '5178']), { port: 5178 });
  assert.throws(() => parseServerArgs(['agent1']), /unexpected positional/);
  assert.throws(() => parseServerArgs(['--name', 'agent.two']), /no longer supported/);
  assert.throws(() => parseServerArgs(['--port', '70000']), /invalid port/);
});

test('formatTable pads list columns so headers align with rows', async () => {
  const { formatTable } = await import(`../dist/cli/table.js?table=${Date.now()}`);

  assert.equal(formatTable([
    ['NAME', 'PID', 'PORT', 'STARTED', 'STATUS'],
    ['fastyclaw', '22504', '5177', '2026-04-25T13:43:50.777Z', 'running'],
  ]), [
    'NAME       PID    PORT  STARTED                   STATUS',
    'fastyclaw  22504  5177  2026-04-25T13:43:50.777Z  running',
  ].join('\n'));
});

test('bearerAuth rejects missing or wrong bearer tokens and accepts the configured token', async () => {
  const { bearerAuth } = await import('../dist/server/auth.js');
  const app = express();
  const config = { get: () => ({ authToken: 'top-secret' }) };
  app.use(bearerAuth(config));
  app.get('/config', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const missing = await fetch(`${baseUrl}/config`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: 'unauthorized' });

    const wrong = await fetch(`${baseUrl}/config`, {
      headers: { Authorization: 'Bearer wrong' },
    });
    assert.equal(wrong.status, 401);

    const ok = await fetch(`${baseUrl}/config`, {
      headers: { Authorization: 'Bearer top-secret' },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('bearerAuth allows requests when auth is disabled', async () => {
  const { bearerAuth } = await import('../dist/server/auth.js');
  const app = express();
  const config = { get: () => ({ authToken: null }) };
  app.use(bearerAuth(config));
  app.get('/config', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');

  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/config`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
