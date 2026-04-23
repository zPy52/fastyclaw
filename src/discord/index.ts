import type { DiscordConfig } from '@/server/types';
import { SubmoduleFastyclawDiscordChats } from '@/discord/chats';
import { SubmoduleFastyclawDiscordClient } from '@/discord/client';
import { SubmoduleFastyclawDiscordHandler } from '@/discord/handler';

export class FastyclawDiscord {
  public static readonly chats = new SubmoduleFastyclawDiscordChats();
  public static readonly client = new SubmoduleFastyclawDiscordClient();
  public static readonly handler = new SubmoduleFastyclawDiscordHandler(
    FastyclawDiscord.client,
    FastyclawDiscord.chats,
  );

  public static async applyConfig(cfg: DiscordConfig): Promise<void> {
    const wantRunning = Boolean(cfg.token && cfg.enabled);
    const running = FastyclawDiscord.client.isRunning();
    if (!wantRunning) {
      if (running) await FastyclawDiscord.client.stop();
      return;
    }
    if (running && FastyclawDiscord.client.currentToken() === cfg.token) return;
    if (running) await FastyclawDiscord.client.stop();
    try {
      await FastyclawDiscord.client.start(cfg.token!, FastyclawDiscord.handler.handle);
      const user = FastyclawDiscord.client.botUser();
      console.log(`[discord] bot started (${user?.tag ?? 'unknown'})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[discord] failed to start bot: ${message}`);
    }
  }

  public static async shutdown(): Promise<void> {
    if (FastyclawDiscord.client.isRunning()) await FastyclawDiscord.client.stop();
  }
}
