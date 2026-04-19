import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { AppConfig, Provider, TelegramConfig, TelegramGroupTrigger } from '@/server/types';

const HOME = os.homedir();
const ROOT_DIR = path.join(HOME, '.fastyclaw');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const THREADS_DIR = path.join(ROOT_DIR, 'threads');
const TELEGRAM_CHATS_PATH = path.join(ROOT_DIR, 'telegram-chats.json');

const DEFAULT_TELEGRAM: TelegramConfig = {
  token: null,
  enabled: false,
  allowedUserIds: [],
  groupTrigger: 'mention',
};

export class Const {
  public static readonly DEFAULT_PORT: number = 5177;
  public static readonly host: string = '127.0.0.1';
  public static readonly baseUrl: string = `http://localhost:${Const.DEFAULT_PORT}`;
  public static readonly defaultModel: string = 'gpt-5.4-mini';
  public static readonly defaultProvider: Provider = 'openai';
  public static readonly skillsDir: string = path.join(HOME, '.agents', 'skills');
  public static readonly fastyclawDir: string = ROOT_DIR;
  public static readonly configPath: string = CONFIG_PATH;
  public static readonly threadsDir: string = THREADS_DIR;
  public static readonly telegramChatsPath: string = TELEGRAM_CHATS_PATH;
  public static readonly browserProfileDir: string =
    process.env.FASTYCLAW_BROWSER_PROFILE ?? path.join(HOME, '.fastyclaw', 'browser-profile');
  public static readonly browserCdpUrl: string | undefined = process.env.FASTYCLAW_BROWSER_CDP_URL;
  public static readonly browserChannel: string | undefined = process.env.FASTYCLAW_BROWSER_CHANNEL ?? 'chrome';
  public static readonly browserHeadless: boolean = process.env.FASTYCLAW_BROWSER_HEADLESS === 'true';
  public static readonly browserViewport: { width: number; height: number } = {
    width: Number(process.env.FASTYCLAW_BROWSER_WIDTH ?? 1280),
    height: Number(process.env.FASTYCLAW_BROWSER_HEIGHT ?? 720),
  };
}

export class AppConfigStore {
  private config: AppConfig;

  public constructor() {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
    this.config = this.read();
  }

  private read(): AppConfig {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppConfig> & { telegram?: Partial<TelegramConfig> };
      const config: AppConfig = {
        model: typeof parsed.model === 'string' ? parsed.model : Const.defaultModel,
        provider: parsed.provider === 'openai' ? 'openai' : Const.defaultProvider,
        cwd: typeof parsed.cwd === 'string' ? parsed.cwd : process.cwd(),
        telegram: mergeTelegram(DEFAULT_TELEGRAM, parsed.telegram),
      };
      return config;
    } catch {
      const initial: AppConfig = {
        model: Const.defaultModel,
        provider: Const.defaultProvider,
        cwd: process.cwd(),
        telegram: { ...DEFAULT_TELEGRAM },
      };
      this.write(initial);
      return initial;
    }
  }

  private write(config: AppConfig): void {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config), 'utf8');
  }

  public get(): AppConfig {
    return { ...this.config, telegram: { ...this.config.telegram } };
  }

  public patch(patch: Partial<AppConfig> & { telegram?: Partial<TelegramConfig> }): AppConfig {
    if (typeof patch.model === 'string') this.config.model = patch.model;
    if (patch.provider === 'openai') this.config.provider = patch.provider;
    if (typeof patch.cwd === 'string') this.config.cwd = path.resolve(patch.cwd);
    if (patch.telegram) {
      this.config.telegram = mergeTelegram(this.config.telegram, patch.telegram);
    }
    this.write(this.config);
    return this.get();
  }
}

function mergeTelegram(base: TelegramConfig, patch: Partial<TelegramConfig> | undefined): TelegramConfig {
  const merged: TelegramConfig = { ...base };
  if (!patch) return merged;
  if (patch.token === null || typeof patch.token === 'string') merged.token = patch.token;
  if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
  if (Array.isArray(patch.allowedUserIds)) {
    merged.allowedUserIds = patch.allowedUserIds.filter((n): n is number => Number.isFinite(n));
  }
  if (patch.groupTrigger === 'mention' || patch.groupTrigger === 'all') {
    merged.groupTrigger = patch.groupTrigger as TelegramGroupTrigger;
  }
  return merged;
}
