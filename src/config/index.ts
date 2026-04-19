import os from 'node:os';
import path from 'node:path';
import { Provider } from '@/client/types';

export class Const {
  public static readonly port: number = Number(process.env.FASTYCLAW_PORT ?? 5177);
  public static readonly host: string = '127.0.0.1';
  public static readonly baseUrl: string = `http://localhost:${Const.port}`;
  public static readonly defaultModel: string = 'gpt-5.4-mini';
  public static readonly defaultProvider: Provider = 'openai';
  public static readonly skillsDir: string = path.join(os.homedir(), '.agents', 'skills');
  public static readonly browserProfileDir: string =
    process.env.FASTYCLAW_BROWSER_PROFILE ?? path.join(os.homedir(), '.fastyclaw', 'browser-profile');
  public static readonly browserCdpUrl: string | undefined = process.env.FASTYCLAW_BROWSER_CDP_URL;
  public static readonly browserChannel: string | undefined = process.env.FASTYCLAW_BROWSER_CHANNEL ?? 'chrome';
  public static readonly browserHeadless: boolean = process.env.FASTYCLAW_BROWSER_HEADLESS === 'true';
}
