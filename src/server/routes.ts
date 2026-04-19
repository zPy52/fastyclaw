import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import { AgentRuntime } from '@/agent/index';
import type { Provider } from '@/server/types';
import type { SubmoduleFastyclawServerSession } from '@/server/session';

export class SubmoduleFastyclawServerRoutes {
  public constructor(private readonly sessions: SubmoduleFastyclawServerSession) {}

  public mount(app: Express): void {
    app.use(express.json({ limit: '4mb' }));

    app.post('/sessions', (_req, res) => this.create(res));
    app.post('/sessions/:id/config', (req, res) => this.config(req, res));
    app.post('/sessions/:id/messages', (req, res) => this.message(req, res));
    app.delete('/sessions/:id', (req, res) => this.remove(req, res));
  }

  private create(res: Response): void {
    const session = this.sessions.create();
    res.json({ sessionId: session.id });
  }

  private config(req: Request, res: Response): void {
    const session = this.sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const { model, provider, cwd } = req.body ?? {};
    if (typeof model === 'string') session.config.model = model;
    if (typeof provider === 'string') {
      if (provider !== 'openai') {
        res.status(400).json({ error: `unsupported provider: ${provider}` });
        return;
      }
      session.config.provider = provider as Provider;
    }
    if (typeof cwd === 'string') {
      session.config.cwd = path.resolve(cwd);
    }
    res.json({ ok: true, config: session.config });
  }

  private async message(req: Request, res: Response): Promise<void> {
    const session = this.sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const text = req.body?.text;
    if (typeof text !== 'string' || text.length === 0) {
      res.status(400).json({ error: 'missing `text`' });
      return;
    }
    session.stream.attach(res);
    req.on('close', () => {
      if (!session.stream.isClosed()) {
        session.abort.abort();
        session.stream.end();
      }
    });
    await AgentRuntime.loop.run(session, text);
  }

  private remove(req: Request, res: Response): void {
    const removed = this.sessions.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    res.json({ ok: true });
  }
}
