import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Const } from '@/config/index';
import type { Automation, AutomationRun, CreateAutomationInput, Trigger } from '@/server/automations/types';

function genId(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8).toLowerCase();
}

export class SubmoduleFastyclawAutomationsStore {
  private items = new Map<string, Automation>();
  private listeners = new Set<(event: 'created' | 'updated' | 'deleted', a: Automation) => void>();
  private writeQueue: Promise<void> = Promise.resolve();

  public async load(): Promise<void> {
    fs.mkdirSync(Const.automationsDir, { recursive: true });
    try {
      const raw = await fsp.readFile(Const.automationsPath, 'utf8');
      const parsed = JSON.parse(raw) as Automation[];
      this.items.clear();
      if (Array.isArray(parsed)) {
        for (const a of parsed) {
          if (a && typeof a.id === 'string') this.items.set(a.id, a);
        }
      }
    } catch {
      this.items.clear();
    }
  }

  public list(): Automation[] {
    return Array.from(this.items.values());
  }

  public get(id: string): Automation | undefined {
    return this.items.get(id);
  }

  public on(fn: (event: 'created' | 'updated' | 'deleted', a: Automation) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(event: 'created' | 'updated' | 'deleted', a: Automation): void {
    for (const fn of this.listeners) {
      try { fn(event, a); } catch { /* ignore */ }
    }
  }

  public async create(input: CreateAutomationInput): Promise<Automation> {
    if (!/^[a-z0-9-]+$/.test(input.name)) {
      throw new Error(`invalid name (kebab-case required): ${input.name}`);
    }
    for (const existing of this.items.values()) {
      if (existing.name === input.name) throw new Error(`automation name already exists: ${input.name}`);
    }
    validateTrigger(input.trigger);
    const id = genId();
    const automation: Automation = {
      id,
      name: input.name,
      description: input.description,
      prompt: input.prompt,
      trigger: input.trigger,
      mode: input.mode ?? { kind: 'fresh' },
      cwd: input.cwd,
      model: input.model,
      enabled: input.enabled ?? true,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy ?? 'http',
    };
    this.items.set(id, automation);
    await this.flush();
    this.emit('created', automation);
    return automation;
  }

  public async patch(id: string, patch: Partial<Automation>): Promise<Automation | null> {
    const current = this.items.get(id);
    if (!current) return null;
    const next: Automation = { ...current };
    if (typeof patch.name === 'string') {
      if (!/^[a-z0-9-]+$/.test(patch.name)) throw new Error(`invalid name (kebab-case required): ${patch.name}`);
      for (const other of this.items.values()) {
        if (other.id !== id && other.name === patch.name) throw new Error(`automation name already exists: ${patch.name}`);
      }
      next.name = patch.name;
    }
    if (typeof patch.description === 'string') next.description = patch.description;
    if (typeof patch.prompt === 'string') next.prompt = patch.prompt;
    if (patch.trigger) {
      validateTrigger(patch.trigger);
      next.trigger = patch.trigger;
    }
    if (patch.mode) next.mode = patch.mode;
    if (patch.cwd !== undefined) next.cwd = patch.cwd;
    if (patch.model !== undefined) next.model = patch.model;
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
    if (typeof patch.lastFiredAt === 'string') next.lastFiredAt = patch.lastFiredAt;
    if (patch.lastError !== undefined) next.lastError = patch.lastError;
    this.items.set(id, next);
    await this.flush();
    this.emit('updated', next);
    return next;
  }

  public async delete(id: string): Promise<boolean> {
    const existing = this.items.get(id);
    if (!existing) return false;
    this.items.delete(id);
    await this.flush();
    try {
      await fsp.rm(path.join(Const.automationsDir, id), { recursive: true, force: true });
    } catch { /* ignore */ }
    this.emit('deleted', existing);
    return true;
  }

  public async readPromptOverride(id: string): Promise<string | null> {
    try {
      return await fsp.readFile(path.join(Const.automationsDir, id, 'prompt.md'), 'utf8');
    } catch {
      return null;
    }
  }

  public async appendRun(id: string, run: AutomationRun): Promise<void> {
    const dir = path.join(Const.automationsDir, id);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.appendFile(path.join(dir, 'runs.jsonl'), JSON.stringify(run) + '\n', 'utf8');
  }

  public async patchRun(id: string, runId: string, patch: Partial<AutomationRun>): Promise<void> {
    const file = path.join(Const.automationsDir, id, 'runs.jsonl');
    let raw: string;
    try { raw = await fsp.readFile(file, 'utf8'); } catch { return; }
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const out: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as AutomationRun;
        if (parsed.runId === runId) out.push(JSON.stringify({ ...parsed, ...patch }));
        else out.push(line);
      } catch {
        out.push(line);
      }
    }
    await fsp.writeFile(file, out.join('\n') + (out.length > 0 ? '\n' : ''), 'utf8');
  }

  public async listRuns(id: string, limit = 50): Promise<AutomationRun[]> {
    const file = path.join(Const.automationsDir, id, 'runs.jsonl');
    let raw: string;
    try { raw = await fsp.readFile(file, 'utf8'); } catch { return []; }
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const tail = lines.slice(-limit);
    const out: AutomationRun[] = [];
    for (const line of tail) {
      try { out.push(JSON.parse(line) as AutomationRun); } catch { /* skip */ }
    }
    return out;
  }

  private async flush(): Promise<void> {
    const snapshot = Array.from(this.items.values());
    this.writeQueue = this.writeQueue.then(async () => {
      fs.mkdirSync(Const.fastyclawDir, { recursive: true });
      const tmp = `${Const.automationsPath}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(snapshot, null, 2), { encoding: 'utf8', mode: 0o600 });
      await fsp.rename(tmp, Const.automationsPath);
    }).catch(() => { /* swallow to keep chain alive */ });
    await this.writeQueue;
  }
}

function validateTrigger(t: Trigger): void {
  if (t.kind === 'cron') {
    if (typeof t.expr !== 'string' || t.expr.trim().length === 0) {
      throw new Error('cron trigger requires non-empty expr');
    }
    return;
  }
  if (t.kind === 'interval') {
    if (!Number.isFinite(t.everyMs) || t.everyMs < 60_000) {
      throw new Error('interval trigger requires everyMs >= 60000');
    }
    return;
  }
  if (t.kind === 'once') {
    const ts = Date.parse(t.at);
    if (!Number.isFinite(ts)) throw new Error('once trigger requires a valid ISO date in `at`');
    return;
  }
  throw new Error(`unknown trigger kind: ${(t as { kind: unknown }).kind}`);
}
