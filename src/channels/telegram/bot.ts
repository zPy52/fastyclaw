import { Bot, type Context } from 'grammy';

export type TelegramMessageHandler = (ctx: Context) => Promise<void>;

export class SubmoduleFastyclawTelegramBot {
  private bot: Bot | null = null;
  private token: string | null = null;
  private running = false;
  private startPromise: Promise<void> | null = null;

  public isRunning(): boolean {
    return this.running;
  }

  public current(): Bot | null {
    return this.bot;
  }

  public currentToken(): string | null {
    return this.token;
  }

  public username(): string | null {
    return this.bot?.botInfo?.username ?? null;
  }

  public async start(token: string, onMessage: TelegramMessageHandler): Promise<void> {
    if (this.running) return;
    const bot = new Bot(token);
    bot.on('message:text', async (ctx) => {
      try {
        await onMessage(ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[telegram] handler error: ${message}`);
      }
    });
    bot.catch((err) => {
      console.error(`[telegram] bot error: ${err.error instanceof Error ? err.error.message : String(err.error)}`);
    });
    await bot.init();
    this.bot = bot;
    this.token = token;
    this.running = true;
    this.startPromise = bot.start({ drop_pending_updates: true }).catch((err) => {
      console.error(`[telegram] poller exited with error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  public async stop(): Promise<void> {
    if (!this.bot) return;
    const bot = this.bot;
    const startPromise = this.startPromise;
    this.running = false;
    this.bot = null;
    this.token = null;
    this.startPromise = null;
    try {
      await bot.stop();
    } catch {
      /* ignore */
    }
    if (startPromise) {
      try { await startPromise; } catch { /* ignore */ }
    }
  }
}
