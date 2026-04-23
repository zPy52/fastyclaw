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
