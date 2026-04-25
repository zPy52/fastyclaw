import { createParser, type EventSourceMessage } from 'eventsource-parser';
import type {
  AppConfig,
  CallOptions,
  ProviderConfig,
  ServerEvent,
  FastyclawClientOptions,
} from './types.js';
import { FastyclawClientTelegram } from './telegram.js';
import { FastyclawClientWhatsapp } from './whatsapp.js';
import { FastyclawClientSlack } from './slack.js';
import { FastyclawClientDiscord } from './discord.js';
import { FastyclawClientProviders } from './providers.js';
import { FastyclawClientAutomations } from './automations.js';

const DEFAULT_BASE_URL = 'http://localhost:5177';

export interface SendMessageOptions {
  threadId?: string;
}

export interface MessageStream extends AsyncIterable<ServerEvent> {
  /** Resolves with the threadId used for this message once the server announces it. */
  readonly threadId: Promise<string>;
}

export class FastyclawClient {
  private readonly baseUrl: string;
  private readonly authHeaders: Record<string, string>;
  private lastThreadId: string | null = null;
  public readonly telegram: FastyclawClientTelegram;
  public readonly whatsapp: FastyclawClientWhatsapp;
  public readonly slack: FastyclawClientSlack;
  public readonly discord: FastyclawClientDiscord;
  public readonly providers: FastyclawClientProviders;
  public readonly automations: FastyclawClientAutomations;

  public constructor(opts?: FastyclawClientOptions) {
    this.baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
    this.authHeaders = opts?.authToken ? { Authorization: `Bearer ${opts.authToken}` } : {};
    this.telegram = new FastyclawClientTelegram(this.baseUrl, this.authHeaders);
    this.whatsapp = new FastyclawClientWhatsapp(this.baseUrl, this.authHeaders);
    this.slack = new FastyclawClientSlack(this.baseUrl, this.authHeaders);
    this.discord = new FastyclawClientDiscord(this.baseUrl, this.authHeaders);
    this.providers = new FastyclawClientProviders(this.baseUrl, this.authHeaders);
    this.automations = new FastyclawClientAutomations(this.baseUrl, this.authHeaders);
  }

  /** The thread id most recently created or used by this client. */
  public get threadId(): string | null {
    return this.lastThreadId;
  }

  /** Explicitly create a new empty thread and return its id. */
  public async createThread(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/threads`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`createThread failed: ${res.status}`);
    const body = (await res.json()) as { threadId: string };
    this.lastThreadId = body.threadId;
    return body.threadId;
  }

  public async deleteThread(threadId?: string): Promise<void> {
    const id = threadId ?? this.lastThreadId;
    if (!id) return;
    if (id === this.lastThreadId) this.lastThreadId = null;
    await fetch(`${this.baseUrl}/threads/${id}`, { method: 'DELETE', headers: this.authHeaders });
  }

  public async getConfig(): Promise<AppConfig> {
    const res = await fetch(`${this.baseUrl}/config`, { headers: this.authHeaders });
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
    return (await res.json()) as AppConfig;
  }

  public async resetConfig(): Promise<AppConfig> {
    const res = await fetch(`${this.baseUrl}/config/reset`, { method: 'POST', headers: this.authHeaders });
    if (!res.ok) throw new Error(`resetConfig failed: ${res.status}`);
    const body = (await res.json()) as { config: AppConfig };
    return body.config;
  }

  public async setModel(model: string): Promise<void> {
    await this.updateConfig({ model });
  }

  public async setProvider(provider: ProviderConfig): Promise<void> {
    await this.updateConfig({ provider });
  }

  public async setProviderOptions(options: Record<string, Record<string, unknown>>): Promise<void> {
    await this.updateConfig({ providerOptions: options });
  }

  public async setCallOptions(options: CallOptions): Promise<void> {
    await this.updateConfig({ callOptions: options });
  }

  public async setCwd(cwd: string): Promise<void> {
    await this.updateConfig({ cwd });
  }

  /**
   * Send a message to a thread. If no threadId is provided (and the client
   * has no current thread), the server creates one automatically and emits a
   * `thread` event with the new id.
   */
  public sendMessage(text: string, opts?: SendMessageOptions): MessageStream {
    const baseUrl = this.baseUrl;
    const authHeaders = this.authHeaders;
    const requestedThreadId = opts?.threadId ?? this.lastThreadId ?? undefined;
    const client = this;

    let resolveThreadId: (id: string) => void = () => {};
    let rejectThreadId: (err: unknown) => void = () => {};
    const threadIdPromise = new Promise<string>((resolve, reject) => {
      resolveThreadId = resolve;
      rejectThreadId = reject;
    });
    // Prevent unhandled-rejection warnings if the caller never awaits it.
    threadIdPromise.catch(() => {});

    const iterable: AsyncIterable<ServerEvent> & { threadId: Promise<string> } = {
      threadId: threadIdPromise,
      [Symbol.asyncIterator]() {
        const queue: ServerEvent[] = [];
        const waiters: Array<(result: IteratorResult<ServerEvent>) => void> = [];
        let done = false;
        let error: unknown = null;

        const push = (ev: ServerEvent) => {
          if (ev.type === 'thread') {
            client.lastThreadId = ev.threadId;
            resolveThreadId(ev.threadId);
          }
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
            const body: Record<string, unknown> = { text };
            if (requestedThreadId) body.threadId = requestedThreadId;
            const res = await fetch(`${baseUrl}/messages`, {
              method: 'POST',
              headers: {
                ...authHeaders,
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
              },
              body: JSON.stringify(body),
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
            rejectThreadId(err);
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
    return iterable;
  }

  private async updateConfig(patch: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/config`, {
      method: 'POST',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`config update failed: ${res.status}`);
  }
}
