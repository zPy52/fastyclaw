import type { WhatsappConfig } from '@/server/types';
import { SubmoduleFastyclawWhatsappChats } from '@/whatsapp/chats';
import { SubmoduleFastyclawWhatsappSock } from '@/whatsapp/sock';
import { SubmoduleFastyclawWhatsappHandler } from '@/whatsapp/handler';

export class FastyclawWhatsapp {
  public static readonly chats = new SubmoduleFastyclawWhatsappChats();
  public static readonly sock = new SubmoduleFastyclawWhatsappSock();
  public static readonly handler = new SubmoduleFastyclawWhatsappHandler(
    FastyclawWhatsapp.sock,
    FastyclawWhatsapp.chats,
  );

  public static async applyConfig(cfg: WhatsappConfig): Promise<void> {
    const running = FastyclawWhatsapp.sock.isRunning();
    if (!cfg.enabled) {
      if (running) await FastyclawWhatsapp.sock.stop();
      return;
    }
    if (running) return;
    try {
      await FastyclawWhatsapp.sock.start(FastyclawWhatsapp.handler.handle);
      console.log('[whatsapp] socket starting');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp] failed to start socket: ${message}`);
    }
  }

  public static async shutdown(): Promise<void> {
    if (FastyclawWhatsapp.sock.isRunning()) await FastyclawWhatsapp.sock.stop();
  }

  public static latestQr(): string | null {
    return FastyclawWhatsapp.sock.latestQr();
  }
}
