import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import type { DiscordMessageHandler } from '@/discord/types';

export class SubmoduleFastyclawDiscordClient {
  private client: Client | null = null;
  private token: string | null = null;
  private running = false;
  private botUserCached: { id: string; tag: string } | null = null;

  public isRunning(): boolean {
    return this.running;
  }

  public current(): Client | null {
    return this.client;
  }

  public currentToken(): string | null {
    return this.token;
  }

  public botUser(): { id: string; tag: string } | null {
    return this.botUserCached;
  }

  public async start(token: string, onMessage: DiscordMessageHandler): Promise<void> {
    if (this.running) return;
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    client.on(Events.MessageCreate, async (m) => {
      try {
        await onMessage(m, client);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[discord] handler error: ${message}`);
      }
    });

    client.on(Events.Error, (err) => {
      console.error(`[discord] client error: ${err instanceof Error ? err.message : String(err)}`);
    });

    const ready = new Promise<void>((resolve) => {
      client.once(Events.ClientReady, (c) => {
        this.botUserCached = { id: c.user.id, tag: c.user.tag };
        resolve();
      });
    });

    await client.login(token);
    await ready;

    this.client = client;
    this.token = token;
    this.running = true;
  }

  public async stop(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.running = false;
    this.client = null;
    this.token = null;
    this.botUserCached = null;
    try {
      await client.destroy();
    } catch {
      /* ignore */
    }
  }
}
