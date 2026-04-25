import test from 'node:test';
import assert from 'node:assert/strict';

test('telegram stream does not render tool calls into chat text', async () => {
  const edits = [];
  const bot = {
    api: {
      async sendMessage() {
        return { message_id: 1 };
      },
      async editMessageText(_chatId, _messageId, text) {
        edits.push(text);
      },
    },
  };

  const { TelegramStream } = await import('../dist/channels/telegram/stream.js');
  const stream = new TelegramStream(bot, 123);

  await stream.init();
  stream.write({
    type: 'tool-call',
    toolCallId: 'tool-1',
    name: 'file_search',
    input: { pattern: '**/AGENTS.md' },
  });
  stream.write({ type: 'text-delta', delta: 'I found the project root.' });
  stream.end();
  await stream.drain();

  assert.deepEqual(edits, ['I found the project root.']);
});
