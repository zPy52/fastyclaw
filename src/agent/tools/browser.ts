import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import type { Browser, Page } from 'playwright';
import type { Session } from '../../server/types.js';

const handles = new WeakMap<Session, { browser: Browser; page: Page }>();

async function ensure(session: Session): Promise<{ browser: Browser; page: Page }> {
  const existing = handles.get(session);
  if (existing) return existing;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const handle = { browser, page };
  handles.set(session, handle);
  return handle;
}

export function browser(session: Session) {
  return tool({
    description: 'Headless browser. Actions: open (navigate), screenshot (PNG saved to cwd/out), extract (visible text).',
    inputSchema: z.object({
      url: z.string().url(),
      action: z.enum(['open', 'screenshot', 'extract']),
    }),
    execute: async ({ url, action }) => {
      const { page } = await ensure(session);
      await page.goto(url, { waitUntil: 'load' });
      if (action === 'open') {
        return { url: page.url(), title: await page.title() };
      }
      if (action === 'screenshot') {
        const outDir = path.join(session.config.cwd, 'out');
        const fs = await import('node:fs/promises');
        await fs.mkdir(outDir, { recursive: true });
        const filename = `screenshot-${Date.now()}.png`;
        const filePath = path.join(outDir, filename);
        await page.screenshot({ path: filePath, fullPage: true });
        return { url: page.url(), path: filePath };
      }
      const text = await page.evaluate(() => (globalThis as unknown as { document: { body: { innerText: string } } }).document.body.innerText);
      return { url: page.url(), text: text.slice(0, 50_000) };
    },
  });
}

export async function closeBrowser(session: Session): Promise<void> {
  const handle = handles.get(session);
  if (!handle) return;
  handles.delete(session);
  try {
    await handle.browser.close();
  } catch {
    // ignore
  }
}
