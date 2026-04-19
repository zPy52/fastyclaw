import { z } from 'zod';
import { tool } from 'ai';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';
import type { Run } from '@/server/types';
import { browserDownloadDir } from '@/agent/sessions/browser';

export interface ScreenshotNoGuiResult {
  status: 'no-gui';
  platform: NodeJS.Platform;
  message: string;
}

export interface ScreenshotOkResult {
  status: 'ok';
  platform: NodeJS.Platform;
  path: string;
  data: string;
  mediaType: 'image/png';
}

export interface ScreenshotErrorResult {
  status: 'error';
  platform: NodeJS.Platform;
  message: string;
}

export type ScreenshotResult = ScreenshotNoGuiResult | ScreenshotOkResult | ScreenshotErrorResult;

function detectGui(): { hasGui: boolean; reason?: string } {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'win32') return { hasGui: true };
  if (platform === 'linux') {
    if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) return { hasGui: true };
    return {
      hasGui: false,
      reason: 'No DISPLAY or WAYLAND_DISPLAY env var detected — looks like a headless/server environment.',
    };
  }
  return { hasGui: false, reason: `Unsupported platform: ${platform}` };
}

async function captureDarwin(filePath: string): Promise<void> {
  await execa('screencapture', ['-x', filePath]);
}

async function captureLinux(filePath: string): Promise<void> {
  const candidates: Array<{ cmd: string; args: string[] }> = process.env.WAYLAND_DISPLAY
    ? [
        { cmd: 'grim', args: [filePath] },
        { cmd: 'gnome-screenshot', args: ['-f', filePath] },
      ]
    : [
        { cmd: 'scrot', args: ['-o', filePath] },
        { cmd: 'gnome-screenshot', args: ['-f', filePath] },
        { cmd: 'import', args: ['-window', 'root', filePath] },
      ];
  const errors: string[] = [];
  for (const { cmd, args } of candidates) {
    try {
      await execa(cmd, args);
      return;
    } catch (err) {
      errors.push(`${cmd}: ${(err as Error).message}`);
    }
  }
  throw new Error(`No screenshot utility succeeded. Tried: ${errors.join('; ')}`);
}

async function captureWindows(filePath: string): Promise<void> {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
    '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;',
    '$g = [System.Drawing.Graphics]::FromImage($bmp);',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);',
    `$bmp.Save('${filePath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);`,
  ].join(' ');
  await execa('powershell', ['-NoProfile', '-Command', script]);
}

export function screenshot(run: Run) {
  return tool({
    description:
      'Capture a screenshot of the user\'s desktop screen (not a browser tab). If running on a headless server/VM without a GUI, returns status="no-gui" with an explanation instead of an image. Uses screencapture on macOS, grim/scrot/gnome-screenshot on Linux, and PowerShell on Windows.',
    inputSchema: z.object({}),
    execute: async (): Promise<ScreenshotResult> => {
      const platform = process.platform;
      const gui = detectGui();
      if (!gui.hasGui) {
        return {
          status: 'no-gui',
          platform,
          message: gui.reason ?? 'No GUI available on this host.',
        };
      }

      const outDir = browserDownloadDir(run);
      await fs.mkdir(outDir, { recursive: true });
      const filePath = path.join(outDir, `desktop-${Date.now()}.png`);

      try {
        if (platform === 'darwin') await captureDarwin(filePath);
        else if (platform === 'linux') await captureLinux(filePath);
        else if (platform === 'win32') await captureWindows(filePath);
        else throw new Error(`Unsupported platform: ${platform}`);
      } catch (err) {
        return {
          status: 'error',
          platform,
          message: (err as Error).message,
        };
      }

      const data = await fs.readFile(filePath);
      return {
        status: 'ok',
        platform,
        path: filePath,
        data: data.toString('base64'),
        mediaType: 'image/png',
      };
    },
    toModelOutput({ output }) {
      const res = output as ScreenshotResult;
      if (res.status === 'ok') {
        return {
          type: 'content',
          value: [
            { type: 'text' as const, text: `Desktop screenshot saved at ${res.path}` },
            { type: 'image-data' as const, data: res.data, mediaType: res.mediaType },
          ],
        };
      }
      if (res.status === 'no-gui') {
        return {
          type: 'content',
          value: [
            {
              type: 'text' as const,
              text: `No GUI available (platform=${res.platform}): ${res.message}`,
            },
          ],
        };
      }
      return {
        type: 'content',
        value: [
          {
            type: 'text' as const,
            text: `Screenshot failed (platform=${res.platform}): ${res.message}`,
          },
        ],
      };
    },
  });
}

export { detectGui };
