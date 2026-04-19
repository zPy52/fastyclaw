import path from 'node:path';
import fs from 'node:fs/promises';
import type { Browser, BrowserContext, Page } from 'playwright';
import { Const } from '@/config/index';
import type { Session } from '@/server/types';

export interface BrowserSessionOptions {
  cdpUrl?: string;
  profileDir?: string;
  headless?: boolean;
  channel?: string;
}

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

    if (this.opts.cdpUrl) {
      const browser = await chromium.connectOverCDP(this.opts.cdpUrl);
      this.cdpBrowser = browser;
      const context = browser.contexts()[0] ?? (await browser.newContext());
      this.context = context;
      const page = context.pages()[0] ?? (await context.newPage());
      return { context, page };
    }

    const profileDir = this.opts.profileDir ?? Const.browserProfileDir;
    await fs.mkdir(profileDir, { recursive: true });

    const launchOpts: Record<string, unknown> = {
      headless: this.opts.headless ?? Const.browserHeadless,
      viewport: null,
      acceptDownloads: true,
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

const handles = new WeakMap<Session, BrowserSession>();

export function getBrowser(session: Session): BrowserSession {
  let b = handles.get(session);
  if (!b) {
    b = new BrowserSession({
      cdpUrl: Const.browserCdpUrl,
      profileDir: Const.browserProfileDir,
      headless: Const.browserHeadless,
      channel: Const.browserChannel,
    });
    handles.set(session, b);
  }
  return b;
}

export async function closeBrowserSession(session: Session): Promise<void> {
  const b = handles.get(session);
  if (!b) return;
  handles.delete(session);
  await b.close();
}

export function browserDownloadDir(session: Session): string {
  return path.join(session.config.cwd, 'out');
}
