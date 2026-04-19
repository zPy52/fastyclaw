import path from 'node:path';
import type { UIMessage } from 'ai';
import { AgentRuntime } from '@/agent/index';
import { createRun } from '@/server/run';
import type { Provider, Thread } from '@/server/types';
import type { AppConfigStore } from '@/config/index';
import type { SubmoduleFastyclawServerThreads } from '@/server/threads';
import express, { type Express, type Request, type Response } from 'express';

export class SubmoduleFastyclawServerRoutes {
  public constructor(
    private readonly threads: SubmoduleFastyclawServerThreads,
    private readonly config: AppConfigStore,
  ) {}

  public mount(app: Express): void {
    app.use(express.json({ limit: '4mb' }));

    app.post('/threads', (_req, res) => this.createThread(res));
    app.delete('/threads/:id', (req, res) => this.deleteThread(req, res));
    app.get('/config', (_req, res) => this.getConfig(res));
    app.post('/config', (req, res) => this.setConfig(req, res));
    app.post('/messages', (req, res) => this.message(req, res));
  }

  private async createThread(res: Response): Promise<void> {
    const thread = await this.threads.create();
    res.json({ threadId: thread.id });
  }

  private async deleteThread(req: Request, res: Response): Promise<void> {
    const removed = await this.threads.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'thread not found' });
      return;
    }
    res.json({ ok: true });
  }

  private getConfig(res: Response): void {
    res.json(this.config.get());
  }

  private setConfig(req: Request, res: Response): void {
    const { model, provider, cwd } = req.body ?? {};
    const patch: { model?: string; provider?: Provider; cwd?: string } = {};
    if (typeof model === 'string') patch.model = model;
    if (typeof provider === 'string') {
      if (provider !== 'openai') {
        res.status(400).json({ error: `unsupported provider: ${provider}` });
        return;
      }
      patch.provider = provider;
    }
    if (typeof cwd === 'string') patch.cwd = path.resolve(cwd);
    const config = this.config.patch(patch);
    res.json({ ok: true, config });
  }

  private async message(req: Request, res: Response): Promise<void> {
    const text = req.body?.text;
    const requestedThreadId = req.body?.threadId;
    if (typeof text !== 'string' || text.length === 0) {
      res.status(400).json({ error: 'missing `text`' });
      return;
    }

    let thread: Thread | null;
    if (typeof requestedThreadId === 'string' && requestedThreadId.length > 0) {
      thread = await this.threads.load(requestedThreadId);
      if (!thread) {
        res.status(404).json({ error: 'thread not found' });
        return;
      }
    } else {
      thread = await this.threads.create();
    }

    this.threads.activate(thread);
    const snapshotConfig = this.config.get();
    const run = createRun(thread, snapshotConfig);

    run.stream.attach(res);
    run.stream.write({ type: 'thread', threadId: thread.id });

    const abortOnDisconnect = () => {
      if (!run.stream.isClosed()) {
        run.abort.abort();
        run.stream.end();
      }
    };
    req.on('aborted', abortOnDisconnect);
    res.on('close', abortOnDisconnect);

    try {
      await AgentRuntime.loop.run(run, text, async (messages: UIMessage[]) => {
        thread!.messages = messages;
        await this.threads.save(thread!);
      });
    } finally {
      run.close();
      this.threads.deactivate(thread.id);
    }
  }
}
