import fs from 'node:fs';
import express from 'express';
import type { Server } from 'node:http';
import { AppConfigStore, Const } from '@/config/index';
import { AgentSkills } from '@/skills/index';
import { SubmoduleFastyclawServerRoutes } from '@/server/routes';
import { SubmoduleFastyclawServerThreads } from '@/server/threads';
import { FastyclawTelegram } from '@/channels/telegram/index';
import { FastyclawWhatsapp } from '@/channels/whatsapp/index';
import { FastyclawSlack } from '@/channels/slack/index';
import { FastyclawDiscord } from '@/channels/discord/index';
import { bearerAuth } from '@/server/auth';
import { pickFreePort, removeStateFiles } from '@/server/daemon';

export class FastyclawServer {
  public static readonly threads = new SubmoduleFastyclawServerThreads();
  public static config: AppConfigStore;
  public static routes: SubmoduleFastyclawServerRoutes;

  public static async start(port?: number): Promise<void> {
    fs.mkdirSync(Const.fastyclawDir, { recursive: true });
    fs.writeFileSync(Const.pidPath, String(process.pid), { encoding: 'utf8', mode: 0o600 });

    let server: Server | undefined;
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void Promise.allSettled([
        FastyclawTelegram.shutdown(),
        FastyclawWhatsapp.shutdown(),
        FastyclawSlack.shutdown(),
        FastyclawDiscord.shutdown(),
      ]).then(() => new Promise<void>((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.close(() => resolve());
      })).finally(() => {
        removeStateFiles();
        process.exit(0);
      });
    };

    FastyclawServer.config = new AppConfigStore();
    FastyclawServer.routes = new SubmoduleFastyclawServerRoutes(
      FastyclawServer.threads,
      FastyclawServer.config,
      shutdown,
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
    app.use(bearerAuth(FastyclawServer.config));
    FastyclawServer.routes.mount(app);
    const requestedPort = port ?? (Number(process.env.FASTYCLAW_PORT) || Const.DEFAULT_PORT);
    const resolvedPort = await pickFreePort(requestedPort);
    await new Promise<void>((resolve) => {
      server = app.listen(resolvedPort, Const.host, () => resolve());
    });
    Const.setPort(resolvedPort);
    fs.writeFileSync(Const.statePath, JSON.stringify({
      pid: process.pid,
      port: resolvedPort,
      host: Const.host,
      publicUrl: Const.publicBaseUrl(),
      startedAt: new Date().toISOString(),
      version: packageVersion(),
    }, null, 2), { encoding: 'utf8', mode: 0o600 });
    console.log(`fastyclaw listening on ${Const.publicBaseUrl()}`);

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}

function packageVersion(): string {
  try {
    const pkgUrl = new URL('../../package.json', import.meta.url);
    const raw = fs.readFileSync(pkgUrl, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
