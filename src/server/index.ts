import express from 'express';
import { Const } from '@/config/index';
import { AgentSkills } from '@/skills/index';
import { SubmoduleFastyclawServerRoutes } from '@/server/routes';
import { SubmoduleFastyclawServerSession } from '@/server/session';

export class FastyclawServer {
  public static readonly sessions = new SubmoduleFastyclawServerSession();
  public static readonly routes = new SubmoduleFastyclawServerRoutes(FastyclawServer.sessions);

  public static async start(): Promise<void> {
    await AgentSkills.loader.load();
    const app = express();
    FastyclawServer.routes.mount(app);
    await new Promise<void>((resolve) => {
      app.listen(Const.port, Const.host, () => resolve());
    });
    console.log(`fastyclaw listening on http://localhost:${Const.port}`);
  }
}
