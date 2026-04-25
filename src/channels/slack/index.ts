import type { SlackConfig } from '@/server/types';
import { SubmoduleFastyclawSlackBot } from '@/channels/slack/bot';
import { SubmoduleFastyclawSlackChats } from '@/channels/slack/chats';
import { SubmoduleFastyclawSlackHandler } from '@/channels/slack/handler';

export class FastyclawSlack {
  public static readonly chats = new SubmoduleFastyclawSlackChats();
  public static readonly bot = new SubmoduleFastyclawSlackBot();
  public static readonly handler = new SubmoduleFastyclawSlackHandler(
    FastyclawSlack.bot,
    FastyclawSlack.chats,
  );

  public static async applyConfig(cfg: SlackConfig): Promise<void> {
    const { botToken, appToken, enabled } = cfg;
    const running = FastyclawSlack.bot.isRunning();
    if (!enabled || !botToken || !appToken) {
      if (running) await FastyclawSlack.bot.stop();
      return;
    }
    const { botToken: curBot, appToken: curApp } = FastyclawSlack.bot.tokens();
    if (running && curBot === botToken && curApp === appToken) return;
    if (running) await FastyclawSlack.bot.stop();
    try {
      await FastyclawSlack.bot.start(botToken, appToken, FastyclawSlack.handler.handle);
      console.log(`[slack] bot started (${FastyclawSlack.bot.botUserId() ?? 'unknown'})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[slack] failed to start bot: ${message}`);
    }
  }

  public static async shutdown(): Promise<void> {
    if (FastyclawSlack.bot.isRunning()) await FastyclawSlack.bot.stop();
  }
}
