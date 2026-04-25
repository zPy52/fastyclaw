import test from 'node:test';
import assert from 'node:assert/strict';

test('whatsapp handler responds to phone-authored messages in the self chat', async () => {
  const ownJid = '34638064214@s.whatsapp.net';
  const runs = [];
  const resolvedChats = [];
  const { FastyclawServer } = await import('../dist/server/index.js');
  const { SubmoduleFastyclawWhatsappHandler } = await import('../dist/channels/whatsapp/handler.js');

  FastyclawServer.config = {
    get() {
      return { whatsapp: { allowedJids: [], groupTrigger: 'mention' } };
    },
  };
  FastyclawServer.threads.load = async (threadId) => ({ id: threadId, messages: [] });

  const handler = new SubmoduleFastyclawWhatsappHandler({
    ownJid() { return ownJid; },
    isOwnJid(jid) { return jid === ownJid; },
    current() { return {}; },
    isRememberedOutboundMessage() { return false; },
  }, {
    async resolve(jid, meta) {
      resolvedChats.push({ jid, meta });
      return 'thread-self';
    },
  });
  handler.runTurn = async (jid, thread, userText) => {
    runs.push({ jid, threadId: thread.id, userText });
  };

  await handler.handle([{
    key: { fromMe: true, remoteJid: ownJid, id: 'phone-authored-self-message' },
    message: { conversation: 'yoo' },
    pushName: 'Antonio',
  }]);

  assert.deepEqual(resolvedChats, [{
    jid: ownJid,
    meta: { title: 'Antonio', kind: 'private' },
  }]);
  assert.deepEqual(runs, [{
    jid: ownJid,
    threadId: 'thread-self',
    userText: 'yoo',
  }]);
});

test('whatsapp handler ignores received private messages by default', async () => {
  const ownJid = '34638064214@s.whatsapp.net';
  const runs = [];
  const resolvedChats = [];
  const { FastyclawServer } = await import('../dist/server/index.js');
  const { SubmoduleFastyclawWhatsappHandler } = await import('../dist/channels/whatsapp/handler.js');

  FastyclawServer.config = {
    get() {
      return { whatsapp: { allowedJids: [], groupTrigger: 'mention' } };
    },
  };
  FastyclawServer.threads.load = async (threadId) => ({ id: threadId, messages: [] });

  const handler = new SubmoduleFastyclawWhatsappHandler({
    ownJid() { return ownJid; },
    isOwnJid(jid) { return jid === ownJid; },
    current() { return {}; },
    isRememberedOutboundMessage() { return false; },
  }, {
    async resolve(jid, meta) {
      resolvedChats.push({ jid, meta });
      return 'thread-other';
    },
  });
  handler.runTurn = async (jid, thread, userText) => {
    runs.push({ jid, threadId: thread.id, userText });
  };

  await handler.handle([{
    key: { fromMe: false, remoteJid: '34611111111@s.whatsapp.net', id: 'received-private-message' },
    message: { conversation: 'hey' },
    pushName: 'Other Person',
  }]);

  assert.deepEqual(resolvedChats, []);
  assert.deepEqual(runs, []);
});

test('whatsapp handler responds to phone-authored group messages by default', async () => {
  const ownJid = '34638064214@s.whatsapp.net';
  const groupJid = '120363123456789@g.us';
  const runs = [];
  const resolvedChats = [];
  const { FastyclawServer } = await import('../dist/server/index.js');
  const { SubmoduleFastyclawWhatsappHandler } = await import('../dist/channels/whatsapp/handler.js');

  FastyclawServer.config = {
    get() {
      return { whatsapp: { allowedJids: [], groupTrigger: 'mention' } };
    },
  };
  FastyclawServer.threads.load = async (threadId) => ({ id: threadId, messages: [] });

  const handler = new SubmoduleFastyclawWhatsappHandler({
    ownJid() { return ownJid; },
    isOwnJid(jid) { return jid === ownJid; },
    current() { return {}; },
    isRememberedOutboundMessage() { return false; },
  }, {
    async resolve(jid, meta) {
      resolvedChats.push({ jid, meta });
      return 'thread-group';
    },
  });
  handler.runTurn = async (jid, thread, userText) => {
    runs.push({ jid, threadId: thread.id, userText });
  };

  await handler.handle([{
    key: { fromMe: true, remoteJid: groupJid, participant: ownJid, id: 'phone-authored-group-message' },
    message: { conversation: 'new room' },
    pushName: 'Antonio',
  }]);

  assert.deepEqual(resolvedChats, [{
    jid: groupJid,
    meta: { title: groupJid, kind: 'group' },
  }]);
  assert.deepEqual(runs, [{
    jid: groupJid,
    threadId: 'thread-group',
    userText: '@Antonio: new room',
  }]);
});
