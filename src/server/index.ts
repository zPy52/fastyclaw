import net from 'node:net';
import express from 'express';
import { Const } from '@/config/index';
import { AgentSkills } from '@/skills/index';
import { SubmoduleFastyclawServerRoutes } from '@/server/routes';
import { SubmoduleFastyclawServerSession } from '@/server/session';

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
  public static readonly sessions = new SubmoduleFastyclawServerSession();
  public static readonly routes = new SubmoduleFastyclawServerRoutes(FastyclawServer.sessions);

  public static async start(port?: number): Promise<void> {
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
