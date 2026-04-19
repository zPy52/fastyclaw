import { z } from 'zod';
import { tool } from 'ai';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Page } from 'playwright';
import type { Run } from '@/server/types';
import { browserDownloadDir, getBrowser } from '@/agent/sessions/browser';

const Action = z.enum([
  'open',
  'back',
  'forward',
  'reload',
  'click',
  'type',
  'press',
  'screenshot',
  'extract',
  'tabs',
  'switch_tab',
  'new_tab',
  'close_tab',
]);

async function pageInfo(page: Page) {
  return { url: page.url(), title: await page.title() };
}

export function browser(run: Run) {
  return tool({
    description:
      'Drive a persistent browser session. Cookies, logins, and tabs persist across calls (uses your Chrome profile when configured). Actions: open, back, forward, reload, click, type, press, screenshot, extract, tabs, switch_tab, new_tab, close_tab.',
    inputSchema: z.object({
      action: Action,
      url: z.string().url().optional().describe('URL for `open` or `new_tab`.'),
      selector: z.string().optional().describe('CSS selector for `click` or `type`.'),
      text: z.string().optional().describe('Text to type for `type` (uses current focus if no selector).'),
      key: z.string().optional().describe('Key for `press`, e.g. "Enter", "Tab", "ArrowDown".'),
      tabIndex: z.number().int().min(0).optional().describe('Tab index for `switch_tab` or `close_tab`.'),
      timeoutMs: z.number().int().min(100).max(120_000).optional().describe('Per-action timeout. Default 15000.'),
    }),
    execute: async ({ action, url, selector, text, key, tabIndex, timeoutMs }) => {
      const browserSession = getBrowser(run);
      const timeout = timeoutMs ?? 15_000;

      if (action === 'tabs') {
        const tabs = await browserSession.tabs();
        return {
          tabs: await Promise.all(
            tabs.map(async (p, i) => ({ index: i, ...(await pageInfo(p)) })),
          ),
        };
      }

      if (action === 'new_tab') {
        const page = await browserSession.newTab();
        if (url) await page.goto(url, { waitUntil: 'load', timeout });
        return { ...(await pageInfo(page)) };
      }

      if (action === 'switch_tab' || action === 'close_tab') {
        const tabs = await browserSession.tabs();
        if (tabIndex === undefined || tabIndex < 0 || tabIndex >= tabs.length) {
          throw new Error(`tabIndex out of range (0..${tabs.length - 1}).`);
        }
        const target = tabs[tabIndex];
        if (action === 'close_tab') {
          await target.close();
          return { closed: tabIndex };
        }
        await target.bringToFront();
        return { ...(await pageInfo(target)) };
      }

      const page = await browserSession.page();

      if (action === 'open') {
        if (!url) throw new Error('`url` is required for action=open.');
        await page.goto(url, { waitUntil: 'load', timeout });
        return pageInfo(page);
      }
      if (action === 'back') { await page.goBack({ timeout }); return pageInfo(page); }
      if (action === 'forward') { await page.goForward({ timeout }); return pageInfo(page); }
      if (action === 'reload') { await page.reload({ timeout }); return pageInfo(page); }

      if (action === 'click') {
        if (!selector) throw new Error('`selector` is required for action=click.');
        await page.click(selector, { timeout });
        return pageInfo(page);
      }

      if (action === 'type') {
        if (text === undefined) throw new Error('`text` is required for action=type.');
        if (selector) {
          await page.fill(selector, text, { timeout });
        } else {
          await page.keyboard.type(text);
        }
        return pageInfo(page);
      }

      if (action === 'press') {
        if (!key) throw new Error('`key` is required for action=press.');
        await page.keyboard.press(key);
        return pageInfo(page);
      }

      if (action === 'screenshot') {
        const outDir = browserDownloadDir(run);
        await fs.mkdir(outDir, { recursive: true });
        const filename = `screenshot-${Date.now()}.png`;
        const filePath = path.join(outDir, filename);
        await page.screenshot({ path: filePath, fullPage: true });
        return { ...(await pageInfo(page)), path: filePath };
      }

      if (action === 'extract') {
        const text = await page.evaluate(
          () => (globalThis as unknown as { document: { body: { innerText: string } } }).document.body.innerText,
        );
        return { ...(await pageInfo(page)), text: text.slice(0, 50_000) };
      }

      throw new Error(`Unknown browser action: ${String(action)}`);
    },
  });
}
