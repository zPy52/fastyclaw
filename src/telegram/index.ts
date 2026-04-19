import type { TelegramConfig } from '@/server/types';
import { SubmoduleFastyclawTelegramBot } from '@/telegram/bot';
import { SubmoduleFastyclawTelegramChats } from '@/telegram/chats';
import { SubmoduleFastyclawTelegramHandler } from '@/telegram/handler';

export class FastyclawTelegram {
  public static readonly chats = new SubmoduleFastyclawTelegramChats();
  public static readonly bot = new SubmoduleFastyclawTelegramBot();
  public static readonly handler = new SubmoduleFastyclawTelegramHandler(
    FastyclawTelegram.bot,
    FastyclawTelegram.chats,
  );

  public static async applyConfig(cfg: TelegramConfig): Promise<void> {
    const running = FastyclawTelegram.bot.isRunning();
    const wantRunning = Boolean(cfg.token && cfg.enabled);
    if (!wantRunning) {
      if (running) await FastyclawTelegram.bot.stop();
      return;
    }
    if (running && FastyclawTelegram.bot.currentToken() === cfg.token) return;
    if (running) await FastyclawTelegram.bot.stop();
    try {
      await FastyclawTelegram.bot.start(cfg.token!, FastyclawTelegram.handler.handle);
      console.log(`[telegram] bot started (@${FastyclawTelegram.bot.username() ?? 'unknown'})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] failed to start bot: ${message}`);
    }
  }

  public static async shutdown(): Promise<void> {
    if (FastyclawTelegram.bot.isRunning()) await FastyclawTelegram.bot.stop();
  }
}
