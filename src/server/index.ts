import net from 'node:net';
import express from 'express';
import { AppConfigStore, Const } from '@/config/index';
import { AgentSkills } from '@/skills/index';
import { SubmoduleFastyclawServerRoutes } from '@/server/routes';
import { SubmoduleFastyclawServerThreads } from '@/server/threads';
import { FastyclawTelegram } from '@/telegram/index';
import { FastyclawWhatsapp } from '@/whatsapp/index';
import { FastyclawSlack } from '@/slack/index';
import { FastyclawDiscord } from '@/discord/index';

function findAvailablePort(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(port, Const.host, () => srv.close(() => resolve(port)));
    srv.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') resolve(findAvailablePort(port + 1));
      else reject(err);
    });
  });
}

export class FastyclawServer {
  public static readonly threads = new SubmoduleFastyclawServerThreads();
  public static config: AppConfigStore;
  public static routes: SubmoduleFastyclawServerRoutes;

  public static async start(port?: number): Promise<void> {
    FastyclawServer.config = new AppConfigStore();
    FastyclawServer.routes = new SubmoduleFastyclawServerRoutes(
      FastyclawServer.threads,
      FastyclawServer.config,
    );
    await AgentSkills.loader.load();
    await FastyclawTelegram.chats.load();
    await FastyclawTelegram.applyConfig(FastyclawServer.config.get().telegram);
    await FastyclawWhatsapp.chats.load();
    await FastyclawWhatsapp.applyConfig(FastyclawServer.config.get().whatsapp);
    await FastyclawSlack.chats.load();
    await FastyclawSlack.applyConfig(FastyclawServer.config.get().slack);
    await FastyclawDiscord.chats.load();
    await FastyclawDiscord.applyConfig(FastyclawServer.config.get().discord);
    const app = express();
    FastyclawServer.routes.mount(app);
    const resolvedPort = await findAvailablePort(port ?? Const.DEFAULT_PORT);
    await new Promise<void>((resolve) => {
      app.listen(resolvedPort, Const.host, () => resolve());
    });
    console.log(`fastyclaw listening on http://localhost:${resolvedPort}`);

    const shutdown = () => {
      void Promise.allSettled([
        FastyclawTelegram.shutdown(),
        FastyclawWhatsapp.shutdown(),
        FastyclawSlack.shutdown(),
        FastyclawDiscord.shutdown(),
      ]).finally(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}
