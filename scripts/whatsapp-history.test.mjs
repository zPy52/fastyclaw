import test from 'node:test';
import assert from 'node:assert/strict';

test('whatsapp history filter only keeps self-chat messages from the current socket session', async () => {
  const { recentWhatsappHistoryMessages } = await import('../dist/channels/whatsapp/sock.js');
  const cutoffMs = Date.parse('2026-04-25T20:19:00.000Z');
  const ownJid = '34638064214@s.whatsapp.net';
  const messages = [
    {
      key: { remoteJid: '34638064214@s.whatsapp.net', id: 'old' },
      messageTimestamp: Math.floor(Date.parse('2026-04-25T20:18:59.000Z') / 1000),
      message: { conversation: 'old' },
    },
    {
      key: { remoteJid: '77726157393958@lid', fromMe: true, id: 'other-chat' },
      messageTimestamp: Math.floor(Date.parse('2026-04-25T20:19:01.000Z') / 1000),
      message: { conversation: 'other' },
    },
    {
      key: { remoteJid: '34638064214@s.whatsapp.net', fromMe: true, id: 'new' },
      messageTimestamp: Math.floor(Date.parse('2026-04-25T20:19:01.000Z') / 1000),
      message: { conversation: 'new' },
    },
  ];

  assert.deepEqual(recentWhatsappHistoryMessages(messages, cutoffMs, [ownJid]), [messages[2]]);
});
