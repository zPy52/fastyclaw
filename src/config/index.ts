import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type {
  AppConfig,
  CallOptions,
  CompactionConfig,
  DiscordConfig,
  DiscordGroupTrigger,
  ProviderConfig,
  ProviderId,
  SlackChannelTrigger,
  SlackConfig,
  TelegramConfig,
  TelegramGroupTrigger,
  WhatsappConfig,
  WhatsappGroupTrigger,
} from '@/server/types';

const HOME = os.homedir();
const ROOT_DIR = path.join(HOME, '.fastyclaw');

const DEFAULT_TELEGRAM: TelegramConfig = {
  token: null,
  enabled: false,
  allowedUserIds: [],
  groupTrigger: 'mention',
};

const DEFAULT_WHATSAPP: WhatsappConfig = {
  enabled: false,
  allowedJids: [],
  groupTrigger: 'mention',
};

const DEFAULT_SLACK: SlackConfig = {
  botToken: null,
  appToken: null,
  enabled: false,
  allowedUserIds: [],
  channelTrigger: 'mention',
};

const DEFAULT_DISCORD: DiscordConfig = {
  token: null,
  enabled: false,
  allowedUserIds: [],
  groupTrigger: 'mention',
};

const DEFAULT_COMPACTION: CompactionConfig = {
  enabled: true,
  triggerRatio: 0.75,
  targetRatio: 0.45,
  recentMessages: 6,
  textPartMaxTokens: 1500,
  summaryModel: null,
  archiveOriginals: true,
};

export interface AppConfigPatch {
  authToken?: string | null;
  model?: string;
  provider?: Partial<ProviderConfig> & { id?: ProviderId };
  providerOptions?: Record<string, Record<string, unknown>>;
  callOptions?: Partial<CallOptions>;
  cwd?: string;
  telegram?: Partial<TelegramConfig>;
  whatsapp?: Partial<WhatsappConfig>;
  slack?: Partial<SlackConfig>;
  discord?: Partial<DiscordConfig>;
  compaction?: Partial<CompactionConfig>;
}

export class Const {
  public static readonly DEFAULT_PORT: number = 5177;
  public static host: string = process.env.FASTYCLAW_HOST ?? '127.0.0.1';
  public static port: number = Number(process.env.FASTYCLAW_PORT || Const.DEFAULT_PORT);
  public static readonly defaultModel: string = 'gpt-5.4-mini';
  public static readonly defaultProviderId: ProviderId = 'openai';
  public static readonly skillsDir: string = path.join(HOME, '.agents', 'skills');
  public static readonly rootDir: string = ROOT_DIR;
  public static readonly fastyclawDir: string = ROOT_DIR;
  public static readonly configPath: string = path.join(ROOT_DIR, 'config.json');
  public static readonly agentsMdPath: string = path.join(ROOT_DIR, 'AGENTS.md');
  public static readonly threadsDir: string = path.join(ROOT_DIR, 'threads');
  public static readonly telegramChatsPath: string = path.join(ROOT_DIR, 'telegram-chats.json');
  public static readonly whatsappAuthDir: string = path.join(ROOT_DIR, 'whatsapp-auth');
  public static readonly whatsappChatsPath: string = path.join(ROOT_DIR, 'whatsapp-chats.json');
  public static readonly slackChatsPath: string = path.join(ROOT_DIR, 'slack-chats.json');
  public static readonly discordChatsPath: string = path.join(ROOT_DIR, 'discord-chats.json');
  public static readonly automationsPath: string = path.join(ROOT_DIR, 'automations.json');
  public static readonly automationsDir: string = path.join(ROOT_DIR, 'automations');
  public static readonly archiveDir: string = path.join(ROOT_DIR, 'threads-archive');
  public static readonly defaultCompaction: CompactionConfig = DEFAULT_COMPACTION;
  public static browserProfileDir: string =
    process.env.FASTYCLAW_BROWSER_PROFILE ?? path.join(ROOT_DIR, 'browser-profile');
  public static readonly pidPath: string = path.join(ROOT_DIR, 'server.pid');
  public static readonly logPath: string = path.join(ROOT_DIR, 'server.log');
  public static readonly errPath: string = path.join(ROOT_DIR, 'server.err');
  public static readonly statePath: string = path.join(ROOT_DIR, 'state.json');
  public static readonly browserCdpUrl: string | undefined = process.env.FASTYCLAW_BROWSER_CDP_URL;
  public static readonly browserChannel: string | undefined = process.env.FASTYCLAW_BROWSER_CHANNEL ?? 'chrome';
  public static readonly browserHeadless: boolean = process.env.FASTYCLAW_BROWSER_HEADLESS === 'true';
  public static readonly browserViewport: { width: number; height: number } = {
    width: Number(process.env.FASTYCLAW_BROWSER_WIDTH ?? 1280),
    height: Number(process.env.FASTYCLAW_BROWSER_HEIGHT ?? 720),
  };

  public static setPort(port: number): void {
    Const.port = port;
  }

  public static baseUrl(): string {
    return `http://${Const.host}:${Const.port}`;
  }

  public static publicBaseUrl(): string {
    return process.env.FASTYCLAW_PUBLIC_URL ?? Const.baseUrl();
  }
}

const SECRET_PROVIDER_FIELDS = new Set(['apiKey', 'accessKeyId', 'secretAccessKey', 'sessionToken']);

export class AppConfigStore {
  private config: AppConfig;

  public constructor() {
    fs.mkdirSync(Const.fastyclawDir, { recursive: true });
    this.config = this.read();
    this.write(this.config);
  }

  private read(): AppConfig {
    try {
      const raw = fs.readFileSync(Const.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return this.normalize(parsed);
    } catch {
      return this.initialConfig();
    }
  }

  private initialConfig(): AppConfig {
    const detected = autoDetectProvider();
    return {
      authToken: null,
      model: detected.model,
      provider: detected.provider,
      providerOptions: {},
      callOptions: {},
      cwd: process.cwd(),
      telegram: { ...DEFAULT_TELEGRAM },
      whatsapp: { ...DEFAULT_WHATSAPP },
      slack: { ...DEFAULT_SLACK },
      discord: { ...DEFAULT_DISCORD },
      compaction: { ...DEFAULT_COMPACTION },
    };
  }

  private normalize(raw: Record<string, unknown>): AppConfig {
    const providerRaw = raw.provider;
    let provider: ProviderConfig;
    if (typeof providerRaw === 'string') {
      provider = legacyProviderFromString(providerRaw);
    } else if (providerRaw && typeof providerRaw === 'object' && typeof (providerRaw as { id?: unknown }).id === 'string') {
      provider = providerRaw as ProviderConfig;
    } else {
      provider = autoDetectProvider().provider;
    }

    const model = typeof raw.model === 'string' ? raw.model : defaultModelFor(provider.id);
    const providerOptions = isStringMap(raw.providerOptions) ? (raw.providerOptions as Record<string, Record<string, unknown>>) : {};
    const callOptions = isStringMap(raw.callOptions) ? (raw.callOptions as CallOptions) : {};
    const authToken = raw.authToken === null || typeof raw.authToken === 'string' ? raw.authToken : null;
    const cwd = typeof raw.cwd === 'string' ? raw.cwd : process.cwd();
    const telegram = mergeTelegram(DEFAULT_TELEGRAM, raw.telegram as Partial<TelegramConfig> | undefined);
    const whatsapp = mergeWhatsapp(DEFAULT_WHATSAPP, raw.whatsapp as Partial<WhatsappConfig> | undefined);
    const slack = mergeSlack(DEFAULT_SLACK, raw.slack as Partial<SlackConfig> | undefined);
    const discord = mergeDiscord(DEFAULT_DISCORD, raw.discord as Partial<DiscordConfig> | undefined);
    const compaction = mergeCompaction(DEFAULT_COMPACTION, raw.compaction as Partial<CompactionConfig> | undefined);

    return { authToken, model, provider, providerOptions, callOptions, cwd, telegram, whatsapp, slack, discord, compaction };
  }

  private write(config: AppConfig): void {
    fs.writeFileSync(Const.configPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(Const.configPath, 0o600);
  }

  public get(): AppConfig {
    return structuredClone(this.config);
  }

  public getMasked(): AppConfig {
    const clone = structuredClone(this.config);
    clone.authToken = maskSecret(clone.authToken);
    clone.provider = maskProvider(clone.provider);
    clone.telegram = { ...clone.telegram, token: maskSecret(clone.telegram.token) };
    clone.slack = {
      ...clone.slack,
      botToken: maskSecret(clone.slack.botToken),
      appToken: maskSecret(clone.slack.appToken),
    };
    clone.discord = { ...clone.discord, token: maskSecret(clone.discord.token) };
    return clone;
  }

  public patch(patch: AppConfigPatch): AppConfig {
    if (patch.authToken === null || typeof patch.authToken === 'string') this.config.authToken = patch.authToken;
    if (typeof patch.model === 'string') this.config.model = patch.model;
    if (patch.provider) {
      const currentId = this.config.provider.id;
      const nextId = (patch.provider.id ?? currentId) as ProviderId;
      if (nextId !== currentId) {
        this.config.provider = { id: nextId, ...patch.provider } as ProviderConfig;
      } else {
        this.config.provider = { ...this.config.provider, ...patch.provider } as ProviderConfig;
      }
    }
    if (patch.providerOptions) {
      const merged: Record<string, Record<string, unknown>> = { ...this.config.providerOptions };
      for (const [k, v] of Object.entries(patch.providerOptions)) {
        if (v == null) { delete merged[k]; continue; }
        const bucket: Record<string, unknown> = { ...(merged[k] ?? {}) };
        for (const [ik, iv] of Object.entries(v)) {
          if (iv === null || iv === undefined) delete bucket[ik];
          else bucket[ik] = iv;
        }
        merged[k] = bucket;
      }
      this.config.providerOptions = merged;
    }
    if (patch.callOptions) {
      const next: Record<string, unknown> = { ...this.config.callOptions };
      for (const [k, v] of Object.entries(patch.callOptions)) {
        if (v === null || v === undefined) delete next[k];
        else next[k] = v;
      }
      this.config.callOptions = next as CallOptions;
    }
    if (typeof patch.cwd === 'string') this.config.cwd = path.resolve(patch.cwd);
    if (patch.telegram) {
      this.config.telegram = mergeTelegram(this.config.telegram, patch.telegram);
    }
    if (patch.whatsapp) {
      this.config.whatsapp = mergeWhatsapp(this.config.whatsapp, patch.whatsapp);
    }
    if (patch.slack) {
      this.config.slack = mergeSlack(this.config.slack, patch.slack);
    }
    if (patch.discord) {
      this.config.discord = mergeDiscord(this.config.discord, patch.discord);
    }
    if (patch.compaction) {
      this.config.compaction = mergeCompaction(this.config.compaction, patch.compaction);
    }
    this.write(this.config);
    return this.get();
  }

  public reset(): AppConfig {
    this.config = this.initialConfig();
    this.write(this.config);
    return this.get();
  }
}

function legacyProviderFromString(id: string): ProviderConfig {
  if (id === 'openai') return { id: 'openai' };
  return autoDetectProvider().provider;
}

function autoDetectProvider(): { provider: ProviderConfig; model: string } {
  if (process.env.AI_GATEWAY_API_KEY) {
    return { provider: { id: 'gateway', apiKey: process.env.AI_GATEWAY_API_KEY }, model: 'openai/gpt-5.4-mini' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: { id: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY }, model: 'claude-sonnet-4-5' };
  }
  if (process.env.GROQ_API_KEY) {
    return { provider: { id: 'groq', apiKey: process.env.GROQ_API_KEY }, model: 'llama-3.3-70b-versatile' };
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { provider: { id: 'google', apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY }, model: 'gemini-2.5-pro' };
  }
  return { provider: { id: 'openai', apiKey: process.env.OPENAI_API_KEY }, model: Const.defaultModel };
}

function defaultModelFor(id: ProviderId): string {
  switch (id) {
    case 'anthropic': return 'claude-sonnet-4-5';
    case 'groq': return 'llama-3.3-70b-versatile';
    case 'google': return 'gemini-2.5-pro';
    case 'gateway': return 'openai/gpt-5.4-mini';
    default: return Const.defaultModel;
  }
}

function maskProvider(p: ProviderConfig): ProviderConfig {
  const out: Record<string, unknown> = { ...(p as unknown as Record<string, unknown>) };
  for (const key of SECRET_PROVIDER_FIELDS) {
    if (typeof out[key] === 'string') out[key] = maskSecret(out[key] as string);
  }
  return out as ProviderConfig;
}

function maskSecret(v: string | null): string | null {
  if (!v) return v;
  if (v.length <= 8) return '…';
  return `${v.slice(0, 3)}…${v.slice(-4)}`;
}

function isStringMap(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
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

function mergeWhatsapp(base: WhatsappConfig, patch: Partial<WhatsappConfig> | undefined): WhatsappConfig {
  const merged: WhatsappConfig = { ...base };
  if (!patch) return merged;
  if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
  if (Array.isArray(patch.allowedJids)) {
    merged.allowedJids = patch.allowedJids.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  if (patch.groupTrigger === 'mention' || patch.groupTrigger === 'all') {
    merged.groupTrigger = patch.groupTrigger as WhatsappGroupTrigger;
  }
  return merged;
}

function mergeSlack(base: SlackConfig, patch: Partial<SlackConfig> | undefined): SlackConfig {
  const merged: SlackConfig = { ...base };
  if (!patch) return merged;
  if (patch.botToken === null || typeof patch.botToken === 'string') merged.botToken = patch.botToken;
  if (patch.appToken === null || typeof patch.appToken === 'string') merged.appToken = patch.appToken;
  if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
  if (Array.isArray(patch.allowedUserIds)) {
    merged.allowedUserIds = patch.allowedUserIds.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  if (patch.channelTrigger === 'mention' || patch.channelTrigger === 'all') {
    merged.channelTrigger = patch.channelTrigger as SlackChannelTrigger;
  }
  return merged;
}

function mergeCompaction(base: CompactionConfig, patch: Partial<CompactionConfig> | undefined): CompactionConfig {
  const merged: CompactionConfig = { ...base };
  if (!patch) return merged;
  if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
  if (typeof patch.triggerRatio === 'number' && Number.isFinite(patch.triggerRatio)) merged.triggerRatio = patch.triggerRatio;
  if (typeof patch.targetRatio === 'number' && Number.isFinite(patch.targetRatio)) merged.targetRatio = patch.targetRatio;
  if (typeof patch.recentMessages === 'number' && Number.isFinite(patch.recentMessages)) {
    merged.recentMessages = Math.max(0, Math.floor(patch.recentMessages));
  }
  if (typeof patch.textPartMaxTokens === 'number' && Number.isFinite(patch.textPartMaxTokens)) {
    merged.textPartMaxTokens = Math.max(0, Math.floor(patch.textPartMaxTokens));
  }
  if (patch.summaryModel === null || typeof patch.summaryModel === 'string') merged.summaryModel = patch.summaryModel;
  if (typeof patch.archiveOriginals === 'boolean') merged.archiveOriginals = patch.archiveOriginals;
  return merged;
}

function mergeDiscord(base: DiscordConfig, patch: Partial<DiscordConfig> | undefined): DiscordConfig {
  const merged: DiscordConfig = { ...base };
  if (!patch) return merged;
  if (patch.token === null || typeof patch.token === 'string') merged.token = patch.token;
  if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
  if (Array.isArray(patch.allowedUserIds)) {
    merged.allowedUserIds = patch.allowedUserIds.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  if (patch.groupTrigger === 'mention' || patch.groupTrigger === 'all') {
    merged.groupTrigger = patch.groupTrigger as DiscordGroupTrigger;
  }
  return merged;
}
