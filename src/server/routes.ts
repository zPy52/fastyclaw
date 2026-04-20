import path from 'node:path';
import type { UIMessage } from 'ai';
import { generateText } from 'ai';
import { AgentRuntime } from '@/agent/index';
import { createRun } from '@/server/run';
import type {
  CallOptions,
  ProviderConfig,
  ProviderId,
  TelegramConfig,
  TelegramGroupTrigger,
  Thread,
} from '@/server/types';
import type { AppConfigPatch, AppConfigStore } from '@/config/index';
import type { SubmoduleFastyclawServerThreads } from '@/server/threads';
import { FastyclawTelegram } from '@/telegram/index';
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
    app.post('/config/reset', (_req, res) => this.resetConfig(res));
    app.post('/messages', (req, res) => this.message(req, res));

    app.get('/providers', (_req, res) => this.listProviders(res));
    app.get('/providers/:id/models', (req, res) => this.providerModels(req, res));
    app.post('/providers/:id/probe', (req, res) => this.providerProbe(req, res));

    app.get('/telegram/config', (_req, res) => this.telegramGetConfig(res));
    app.post('/telegram/config', (req, res) => this.telegramSetConfig(req, res));
    app.post('/telegram/start', (_req, res) => this.telegramStart(res));
    app.post('/telegram/stop', (_req, res) => this.telegramStop(res));
    app.get('/telegram/status', (_req, res) => this.telegramStatus(res));
    app.get('/telegram/chats', (_req, res) => this.telegramListChats(res));
    app.delete('/telegram/chats/:chatId', (req, res) => this.telegramForgetChat(req, res));
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
    res.json(this.config.getMasked());
  }

  private setConfig(req: Request, res: Response): void {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: AppConfigPatch = {};

    if (typeof body.model === 'string') patch.model = body.model;
    if (typeof body.cwd === 'string') patch.cwd = path.resolve(body.cwd);

    if (body.provider !== undefined) {
      const parsed = parseProviderPatch(body.provider);
      if ('error' in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      patch.provider = parsed.value;
    }

    if (body.providerOptions !== undefined) {
      if (!isStringMap(body.providerOptions)) {
        res.status(400).json({ error: 'providerOptions must be an object' });
        return;
      }
      const po: Record<string, Record<string, unknown>> = {};
      for (const [k, v] of Object.entries(body.providerOptions as Record<string, unknown>)) {
        if (v === null) { po[k] = {} as Record<string, unknown>; continue; }
        if (!isStringMap(v)) {
          res.status(400).json({ error: `providerOptions.${k} must be an object` });
          return;
        }
        po[k] = v as Record<string, unknown>;
      }
      patch.providerOptions = po;
    }

    if (body.callOptions !== undefined) {
      if (!isStringMap(body.callOptions)) {
        res.status(400).json({ error: 'callOptions must be an object' });
        return;
      }
      patch.callOptions = body.callOptions as Partial<CallOptions>;
    }

    if (body.telegram !== undefined) {
      if (!isStringMap(body.telegram)) {
        res.status(400).json({ error: 'telegram must be an object' });
        return;
      }
      patch.telegram = body.telegram as Partial<TelegramConfig>;
    }

    this.config.patch(patch);
    res.json({ ok: true, config: this.config.getMasked() });
  }

  private resetConfig(res: Response): void {
    this.config.reset();
    res.json({ ok: true, config: this.config.getMasked() });
  }

  private async listProviders(res: Response): Promise<void> {
    const current = this.config.get().provider.id;
    const adapters = AgentRuntime.provider.registry.list();
    const out = await Promise.all(adapters.map(async (a) => ({
      id: a.id,
      pkg: a.pkg,
      installed: await AgentRuntime.provider.installed(a),
      docsUrl: a.docsUrl,
      active: a.id === current,
    })));
    res.json(out);
  }

  private async providerModels(req: Request, res: Response): Promise<void> {
    const id = req.params.id as ProviderId;
    const adapter = AgentRuntime.provider.registry.get(id);
    if (!adapter) {
      res.status(404).json({ error: `unknown provider: ${id}` });
      return;
    }
    const current = this.config.get().provider;
    const cfg = current.id === id ? current : ({ id } as ProviderConfig);
    if (!adapter.listModels) {
      res.json({ models: [], note: 'not supported' });
      return;
    }
    const models = await AgentRuntime.provider.listModels(cfg);
    res.json({ models });
  }

  private async providerProbe(req: Request, res: Response): Promise<void> {
    const id = req.params.id as ProviderId;
    const adapter = AgentRuntime.provider.registry.get(id);
    if (!adapter) {
      res.status(404).json({ error: `unknown provider: ${id}` });
      return;
    }
    const body = (req.body ?? {}) as { settings?: Record<string, unknown>; model?: string };
    const model = typeof body.model === 'string' && body.model.length > 0
      ? body.model
      : this.config.get().model;
    const settings = isStringMap(body.settings) ? (body.settings as Record<string, unknown>) : {};
    const cfg = { id, ...settings } as ProviderConfig;
    try {
      const lm = await adapter.create(cfg, model);
      await generateText({ model: lm, prompt: 'ping', maxOutputTokens: 1 });
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
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

  private maskToken(token: string | null): string | null {
    if (!token) return null;
    if (token.length <= 4) return '…';
    return `…${token.slice(-4)}`;
  }

  private telegramGetConfig(res: Response): void {
    const cfg = this.config.get().telegram;
    res.json({ ...cfg, token: this.maskToken(cfg.token) });
  }

  private async telegramSetConfig(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Partial<TelegramConfig>;
    const patch: Partial<TelegramConfig> = {};
    if (body.token === null || typeof body.token === 'string') patch.token = body.token;
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (Array.isArray(body.allowedUserIds)) {
      if (!body.allowedUserIds.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        res.status(400).json({ error: 'allowedUserIds must be numbers' });
        return;
      }
      patch.allowedUserIds = body.allowedUserIds;
    }
    if (body.groupTrigger !== undefined) {
      if (body.groupTrigger !== 'mention' && body.groupTrigger !== 'all') {
        res.status(400).json({ error: `invalid groupTrigger: ${body.groupTrigger}` });
        return;
      }
      patch.groupTrigger = body.groupTrigger as TelegramGroupTrigger;
    }
    const next = this.config.patch({ telegram: patch });
    await FastyclawTelegram.applyConfig(next.telegram);
    res.json({ ok: true, config: { ...next.telegram, token: this.maskToken(next.telegram.token) } });
  }

  private async telegramStart(res: Response): Promise<void> {
    const current = this.config.get().telegram;
    if (!current.token) {
      res.status(400).json({ error: 'no token configured' });
      return;
    }
    const next = this.config.patch({ telegram: { enabled: true } });
    await FastyclawTelegram.applyConfig(next.telegram);
    res.json({ ok: true, running: FastyclawTelegram.bot.isRunning() });
  }

  private async telegramStop(res: Response): Promise<void> {
    const next = this.config.patch({ telegram: { enabled: false } });
    await FastyclawTelegram.applyConfig(next.telegram);
    res.json({ ok: true, running: FastyclawTelegram.bot.isRunning() });
  }

  private telegramStatus(res: Response): void {
    res.json({
      running: FastyclawTelegram.bot.isRunning(),
      botUsername: FastyclawTelegram.bot.username(),
      chatCount: FastyclawTelegram.chats.count(),
    });
  }

  private telegramListChats(res: Response): void {
    res.json(FastyclawTelegram.chats.list());
  }

  private async telegramForgetChat(req: Request, res: Response): Promise<void> {
    const chatId = Number(req.params.chatId);
    if (!Number.isFinite(chatId)) {
      res.status(400).json({ error: 'invalid chatId' });
      return;
    }
    await FastyclawTelegram.chats.forget(chatId);
    res.json({ ok: true });
  }
}

const KNOWN_PROVIDER_IDS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  'openai', 'anthropic', 'google', 'google-vertex', 'azure',
  'amazon-bedrock', 'groq', 'mistral', 'xai', 'deepseek',
  'perplexity', 'cohere', 'togetherai', 'fireworks', 'cerebras',
  'openai-compatible', 'gateway',
  'claude-code', 'codex-cli', 'gemini-cli', 'ollama', 'openrouter',
]);

function parseProviderPatch(raw: unknown): { value: Partial<ProviderConfig> } | { error: string } {
  if (typeof raw === 'string') {
    if (!KNOWN_PROVIDER_IDS.has(raw as ProviderId)) return { error: `unsupported provider: ${raw}` };
    return { value: { id: raw as ProviderId } as Partial<ProviderConfig> };
  }
  if (!isStringMap(raw)) return { error: 'provider must be an object or string id' };
  const obj = raw as Record<string, unknown>;
  if (obj.id !== undefined && (typeof obj.id !== 'string' || !KNOWN_PROVIDER_IDS.has(obj.id as ProviderId))) {
    return { error: `unsupported provider: ${String(obj.id)}` };
  }
  return { value: obj as Partial<ProviderConfig> };
}

function isStringMap(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
