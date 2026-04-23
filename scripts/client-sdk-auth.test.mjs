import test from 'node:test';
import assert from 'node:assert/strict';

test('FastyclawClient sends the bearer token on root and subclient fetches', async () => {
  const calls = [];
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/messages')) {
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"thread","threadId":"thread-2"}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
            controller.close();
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        if (String(url).endsWith('/threads')) return { threadId: 'thread-1' };
        if (String(url).endsWith('/providers')) return [];
        return {};
      },
    };
  };

  try {
    const { FastyclawClient } = await import('../client-sdk/dist/client.js');
    const client = new FastyclawClient({
      baseUrl: 'https://fastyclaw.example.com',
      authToken: 'shared-secret',
    });

    await client.createThread();
    await client.getConfig();
    await client.telegram.status();
    await client.whatsapp.qr();
    await client.slack.disable();
    await client.discord.listChats();
    await client.providers.list();
    for await (const _event of client.sendMessage('ping')) {
      // drain stream
    }

    assert.equal(calls.length, 8);
    for (const call of calls) {
      assert.equal(call.init.headers.Authorization, 'Bearer shared-secret', call.url);
    }
  } finally {
    globalThis.fetch = priorFetch;
  }
});
