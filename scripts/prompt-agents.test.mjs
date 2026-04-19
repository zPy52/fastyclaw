import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function makeRun(cwd) {
  return {
    threadId: 'thread-test',
    thread: { id: 'thread-test', messages: [] },
    config: {
      cwd,
      model: 'gpt-test',
      provider: 'openai',
    },
    abort: new AbortController(),
    stream: {
      isClosed: () => false,
      write: () => {},
      end: () => {},
    },
    close: () => {},
  };
}

test('system prompt automatically includes AGENTS.md content from cwd ancestry', async () => {
  const [{ SubmoduleAgentRuntimePrompt }] = await Promise.all([
    import('../dist/agent/prompt.js'),
  ]);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastyclaw-agents-'));
  const nested = path.join(root, 'apps', 'demo');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(root, 'AGENTS.md'), 'Root rule');
  await fs.writeFile(path.join(root, 'apps', 'AGENTS.md'), 'Nested rule');

  const prompt = new SubmoduleAgentRuntimePrompt().build(makeRun(nested));

  assert.match(prompt, /Root rule/);
  assert.match(prompt, /Nested rule/);
});

test('tool registry does not expose get_rules', async () => {
  const [{ AgentTools }] = await Promise.all([
    import('../dist/agent/tools/index.js'),
  ]);

  const tools = AgentTools.all(makeRun(process.cwd()));

  assert.equal('get_rules' in tools, false);
});
