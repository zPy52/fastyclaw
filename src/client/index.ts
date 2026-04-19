import { createParser, type EventSourceMessage } from 'eventsource-parser';
import { Const } from '@/config/index';
import type { Provider, ServerEvent } from '@/server/types';
import type { FastyclawClientOptions } from '@/client/types';

export class FastyclawClient {
  private readonly baseUrl: string;
  private sessionId: string | null = null;

  public constructor(opts?: FastyclawClientOptions) {
    this.baseUrl = opts?.baseUrl ?? Const.baseUrl;
  }

  public async connect(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions`, { method: 'POST' });
    if (!res.ok) throw new Error(`connect failed: ${res.status}`);
    const body = (await res.json()) as { sessionId: string };
    this.sessionId = body.sessionId;
  }

  public async setModel(model: string): Promise<void> {
    await this.updateConfig({ model });
  }

  public async setProvider(provider: Provider): Promise<void> {
    await this.updateConfig({ provider });
  }

  public async setCwd(cwd: string): Promise<void> {
    await this.updateConfig({ cwd });
  }

  public sendMessage(text: string): AsyncIterable<ServerEvent> {
    const id = this.requireSession();
    const baseUrl = this.baseUrl;
    return {
      [Symbol.asyncIterator]() {
        const queue: ServerEvent[] = [];
        const waiters: Array<(result: IteratorResult<ServerEvent>) => void> = [];
        let done = false;
        let error: unknown = null;

        const push = (ev: ServerEvent) => {
          const waiter = waiters.shift();
          if (waiter) waiter({ value: ev, done: false });
          else queue.push(ev);
        };
        const finish = () => {
          done = true;
          while (waiters.length > 0) {
            const waiter = waiters.shift()!;
            waiter({ value: undefined as unknown as ServerEvent, done: true });
          }
        };

        const parser = createParser({
          onEvent(event: EventSourceMessage) {
            if (!event.data) return;
            try {
              push(JSON.parse(event.data) as ServerEvent);
            } catch {
              // skip invalid JSON
            }
          },
        });

        (async () => {
          try {
            const res = await fetch(`${baseUrl}/sessions/${id}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
              body: JSON.stringify({ text }),
            });
            if (!res.ok || !res.body) {
              throw new Error(`sendMessage failed: ${res.status}`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            for (;;) {
              const { value, done: streamDone } = await reader.read();
              if (streamDone) break;
              parser.feed(decoder.decode(value, { stream: true }));
            }
          } catch (err) {
            error = err;
          } finally {
            finish();
          }
        })();

        return {
          next(): Promise<IteratorResult<ServerEvent>> {
            if (error) return Promise.reject(error);
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift()!, done: false });
            }
            if (done) {
              return Promise.resolve({ value: undefined as unknown as ServerEvent, done: true });
            }
            return new Promise((resolve) => waiters.push(resolve));
          },
        };
      },
    };
  }

  public async close(): Promise<void> {
    if (!this.sessionId) return;
    const id = this.sessionId;
    this.sessionId = null;
    await fetch(`${this.baseUrl}/sessions/${id}`, { method: 'DELETE' });
  }

  private async updateConfig(patch: Record<string, unknown>): Promise<void> {
    const id = this.requireSession();
    const res = await fetch(`${this.baseUrl}/sessions/${id}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`config update failed: ${res.status}`);
  }

  private requireSession(): string {
    if (!this.sessionId) throw new Error('FastyclawClient: call connect() first');
    return this.sessionId;
  }
}
