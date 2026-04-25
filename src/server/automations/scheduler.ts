import { CronExpressionParser } from 'cron-parser';
import crypto from 'node:crypto';
import type { Automation } from '@/server/automations/types';
import type { SubmoduleFastyclawAutomationsStore } from '@/server/automations/store';
import type { SubmoduleFastyclawAutomationsRunner } from '@/server/automations/runner';

const TICK_MS = 1_000;
const MAX_JITTER_MS = 15 * 60 * 1_000;

function jitterMs(id: string, periodMs: number): number {
  const cap = Math.min(MAX_JITTER_MS, Math.max(0, Math.floor(periodMs * 0.1)));
  if (cap === 0) return 0;
  const hash = crypto.createHash('sha256').update(id).digest();
  const n = hash.readUInt32BE(0);
  return n % (cap + 1);
}

export class SubmoduleFastyclawAutomationsScheduler {
  private timer?: NodeJS.Timeout;
  private nextFire = new Map<string, number>();
  private running = false;
  private offStoreListener?: () => void;

  public constructor(
    private readonly store: SubmoduleFastyclawAutomationsStore,
    private readonly runner: SubmoduleFastyclawAutomationsRunner,
  ) {}

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.recomputeAll();
    this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
    this.offStoreListener = this.store.on((event, automation) => {
      if (event === 'deleted') {
        this.nextFire.delete(automation.id);
        return;
      }
      this.recompute(automation);
    });
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.offStoreListener) this.offStoreListener();
    this.offStoreListener = undefined;
    this.nextFire.clear();
  }

  public recomputeAll(): void {
    this.nextFire.clear();
    for (const a of this.store.list()) this.recompute(a);
  }

  public recompute(a: Automation): void {
    if (!a.enabled) {
      this.nextFire.delete(a.id);
      return;
    }
    const next = this.computeNext(a, Date.now());
    if (next == null) {
      this.nextFire.delete(a.id);
      return;
    }
    this.nextFire.set(a.id, next);
  }

  private computeNext(a: Automation, fromMs: number): number | null {
    const t = a.trigger;
    if (t.kind === 'cron') {
      try {
        const it = CronExpressionParser.parse(t.expr, { currentDate: new Date(fromMs) });
        const base = it.next().getTime();
        const periodMs = base - fromMs;
        return base + jitterMs(a.id, periodMs);
      } catch {
        return null;
      }
    }
    if (t.kind === 'interval') {
      return fromMs + t.everyMs + jitterMs(a.id, t.everyMs);
    }
    if (t.kind === 'once') {
      const ts = Date.parse(t.at);
      if (!Number.isFinite(ts)) return null;
      if (ts <= fromMs) return null;
      return ts;
    }
    return null;
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const due: Automation[] = [];
    for (const a of this.store.list()) {
      if (!a.enabled) {
        this.nextFire.delete(a.id);
        continue;
      }
      const next = this.nextFire.get(a.id);
      if (next == null) continue;
      if (next > now) continue;
      due.push(a);
    }
    for (const a of due) {
      this.nextFire.delete(a.id);
      void this.runner.fire(a)
        .catch(() => { /* swallow; logged in runs.jsonl */ })
        .finally(() => {
          const fresh = this.store.get(a.id);
          if (fresh) this.recompute(fresh);
        });
    }
  }
}
