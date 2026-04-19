import path from 'node:path';
import fs from 'node:fs/promises';
import { Const } from '@/config/index';
import type { Run } from '@/server/types';
import type { Browser, BrowserContext, Page } from 'playwright';

export interface BrowserSessionOptions {
  cdpUrl?: string;
  profileDir?: string;
  headless?: boolean;
  channel?: string;
  viewport?: { width: number; height: number };
}

const COMPUTER_USE_ARGS = [
  '--disable-extensions',
  '--disable-file-system',
];

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export class BrowserSession {
  private context: BrowserContext | null = null;
  private cdpBrowser: Browser | null = null;
  private bootPromise: Promise<{ context: BrowserContext; page: Page }> | null = null;

  public constructor(private readonly opts: BrowserSessionOptions = {}) {}

  public ensure(): Promise<{ context: BrowserContext; page: Page }> {
    if (!this.bootPromise) this.bootPromise = this.boot();
    return this.bootPromise;
  }

  private async boot(): Promise<{ context: BrowserContext; page: Page }> {
    const { chromium } = await import('playwright');
    const viewport = this.opts.viewport ?? DEFAULT_VIEWPORT;

    if (this.opts.cdpUrl) {
      const browser = await chromium.connectOverCDP(this.opts.cdpUrl);
      this.cdpBrowser = browser;
      const context = browser.contexts()[0] ?? (await browser.newContext({ viewport }));
      this.context = context;
      const page = context.pages()[0] ?? (await context.newPage());
      try { await page.setViewportSize(viewport); } catch { /* CDP page may reject resize */ }
      return { context, page };
    }

    const profileDir = this.opts.profileDir ?? Const.browserProfileDir;
    await fs.mkdir(profileDir, { recursive: true });

    const launchOpts: Record<string, unknown> = {
      headless: this.opts.headless ?? Const.browserHeadless,
      viewport,
      acceptDownloads: true,
      chromiumSandbox: true,
      args: COMPUTER_USE_ARGS,
      env: {},
    };
    if (this.opts.channel) launchOpts.channel = this.opts.channel;

    const context = await chromium.launchPersistentContext(profileDir, launchOpts as never);
    this.context = context;
    const page = context.pages()[0] ?? (await context.newPage());
    return { context, page };
  }

  public async page(): Promise<Page> {
    const { context } = await this.ensure();
    const pages = context.pages();
    return pages[pages.length - 1] ?? (await context.newPage());
  }

  public async newTab(): Promise<Page> {
    const { context } = await this.ensure();
    return context.newPage();
  }

  public async tabs(): Promise<Page[]> {
    const { context } = await this.ensure();
    return context.pages();
  }

  public async close(): Promise<void> {
    const ctx = this.context;
    const cdp = this.cdpBrowser;
    this.context = null;
    this.cdpBrowser = null;
    this.bootPromise = null;
    try { if (ctx) await ctx.close(); } catch { /* ignore */ }
    try { if (cdp) await cdp.close(); } catch { /* ignore */ }
  }
}

const handles = new Map<string, BrowserSession>();

export function getBrowser(run: Run): BrowserSession {
  let b = handles.get(run.threadId);
  if (!b) {
    b = new BrowserSession({
      cdpUrl: Const.browserCdpUrl,
      profileDir: Const.browserProfileDir,
      headless: Const.browserHeadless,
      channel: Const.browserChannel,
      viewport: Const.browserViewport,
    });
    handles.set(run.threadId, b);
  }
  return b;
}

export async function closeBrowserSession(threadId: string): Promise<void> {
  const b = handles.get(threadId);
  if (!b) return;
  handles.delete(threadId);
  await b.close();
}

export function browserDownloadDir(run: Run): string {
  return path.join(run.config.cwd, 'out');
}
