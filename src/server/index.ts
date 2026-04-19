import net from 'node:net';
import express from 'express';
import { AppConfigStore, Const } from '@/config/index';
import { AgentSkills } from '@/skills/index';
import { SubmoduleFastyclawServerRoutes } from '@/server/routes';
import { SubmoduleFastyclawServerThreads } from '@/server/threads';

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
    const app = express();
    FastyclawServer.routes.mount(app);
    const resolvedPort = await findAvailablePort(port ?? Const.DEFAULT_PORT);
    await new Promise<void>((resolve) => {
      app.listen(resolvedPort, Const.host, () => resolve());
    });
    console.log(`fastyclaw listening on http://localhost:${resolvedPort}`);
  }
}
