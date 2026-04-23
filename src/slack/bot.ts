import { App } from '@slack/bolt';
import type { SlackEventHandler, SlackIncomingEvent } from '@/slack/types';

export class SubmoduleFastyclawSlackBot {
  private app: App | null = null;
  private botToken: string | null = null;
  private appToken: string | null = null;
  private botUserIdCached: string | null = null;
  private running = false;

  public isRunning(): boolean {
    return this.running;
  }

  public current(): App | null {
    return this.app;
  }

  public botUserId(): string | null {
    return this.botUserIdCached;
  }

  public tokens(): { botToken: string | null; appToken: string | null } {
    return { botToken: this.botToken, appToken: this.appToken };
  }

  public async start(botToken: string, appToken: string, onEvent: SlackEventHandler): Promise<void> {
    if (this.running) return;
    const app = new App({
      token: botToken,
      appToken,
      socketMode: true,
      logLevel: 'error' as unknown as never,
    });
    const who = await app.client.auth.test({ token: botToken });
    this.botUserIdCached = (who.user_id as string | undefined) ?? null;

    app.event('message', async ({ event, client }) => {
      try {
        await onEvent('message', event as unknown as SlackIncomingEvent, client);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[slack] message handler error: ${message}`);
      }
    });
    app.event('app_mention', async ({ event, client }) => {
      try {
        await onEvent('app_mention', event as unknown as SlackIncomingEvent, client);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[slack] app_mention handler error: ${message}`);
      }
    });
    app.error(async (err) => {
      console.error(`[slack] bolt error: ${err instanceof Error ? err.message : String(err)}`);
    });

    await app.start();
    this.app = app;
    this.botToken = botToken;
    this.appToken = appToken;
    this.running = true;
  }

  public async stop(): Promise<void> {
    if (!this.app) return;
    const app = this.app;
    this.running = false;
    this.app = null;
    this.botToken = null;
    this.appToken = null;
    this.botUserIdCached = null;
    try {
      await app.stop();
    } catch {
      /* ignore */
    }
  }
}
