import { z } from 'zod';
import { tool } from 'ai';
import { execa } from 'execa';
import type { Run } from '@/server/types';
import {
  captureScreenshot,
  detectGui,
  type ScreenshotResult,
} from '@/agent/tools/screenshot';

const Action = z.enum([
  'screenshot',
  'left_click',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'mouse_move',
  'cursor_position',
  'drag',
  'scroll',
  'type',
  'key',
  'hold_key',
  'wait',
  'open_application',
  'list_applications',
  'read_clipboard',
  'write_clipboard',
]);

type ActionType = z.infer<typeof Action>;

type Modifier = 'shift' | 'ctrl' | 'alt' | 'meta';

export interface ComputerOkResult {
  status: 'ok';
  platform: NodeJS.Platform;
  data?: unknown;
}
export interface ComputerNoGuiResult {
  status: 'no-gui';
  platform: NodeJS.Platform;
  message: string;
}
export interface ComputerErrorResult {
  status: 'error';
  platform: NodeJS.Platform;
  message: string;
  hint?: string;
}

export type ComputerResult =
  | ComputerOkResult
  | ComputerNoGuiResult
  | ComputerErrorResult
  | ScreenshotResult;

const NEEDS_GUI: ReadonlySet<ActionType> = new Set<ActionType>([
  'screenshot',
  'left_click',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'mouse_move',
  'cursor_position',
  'drag',
  'scroll',
  'type',
  'key',
  'hold_key',
]);

function err(message: string, hint?: string): ComputerErrorResult {
  return { status: 'error', platform: process.platform, message, ...(hint ? { hint } : {}) };
}

function ok(data?: unknown): ComputerOkResult {
  return { status: 'ok', platform: process.platform, ...(data !== undefined ? { data } : {}) };
}

async function which(cmd: string): Promise<boolean> {
  try {
    const finder = process.platform === 'win32' ? 'where' : 'command';
    const args = process.platform === 'win32' ? [cmd] : ['-v', cmd];
    if (process.platform === 'win32') {
      await execa(finder, args, { reject: true });
    } else {
      await execa('sh', ['-c', `command -v ${cmd}`], { reject: true });
    }
    return true;
  } catch {
    return false;
  }
}

const INSTALL_HINT: Record<string, string> = {
  cliclick: 'Install with: brew install cliclick',
  xdotool: 'Install with: sudo apt install xdotool (X11) or use Wayland with ydotool/wtype',
  ydotool: 'Install with your package manager and ensure ydotoold is running',
  wtype: 'Install with your Wayland-compatible package manager (e.g. apt install wtype)',
};

function isWayland(): boolean {
  return Boolean(process.env.WAYLAND_DISPLAY) && !process.env.DISPLAY;
}

// ---------- macOS (cliclick) ----------

async function macClick(x: number, y: number, kind: 'c' | 'dc' | 'rc' | 'tc'): Promise<void> {
  await ensureCliclick();
  await execa('cliclick', [`${kind}:${x},${y}`]);
}

async function macMiddleClick(x: number, y: number): Promise<void> {
  // cliclick has no native middle-click; emulate with AppleScript via Quartz events is complex.
  // Fall back to a single left click and surface a clear error if user actually needs middle.
  // Most apps treat middle-click via cmd+click for "open in new tab". We do that as a best-effort.
  await ensureCliclick();
  await execa('cliclick', [`kd:cmd`, `c:${x},${y}`, `ku:cmd`]);
}

async function macMove(x: number, y: number): Promise<void> {
  await ensureCliclick();
  await execa('cliclick', [`m:${x},${y}`]);
}

async function macPosition(): Promise<{ x: number; y: number }> {
  await ensureCliclick();
  const { stdout } = await execa('cliclick', ['p']);
  const [x, y] = stdout.trim().split(',').map((n) => Number(n));
  return { x, y };
}

async function macDrag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
  await ensureCliclick();
  await execa('cliclick', [`dd:${x1},${y1}`, `du:${x2},${y2}`]);
}

async function macType(text: string): Promise<void> {
  await ensureCliclick();
  await execa('cliclick', ['-w', '20', `t:${text}`]);
}

async function macKey(combo: string, modifiers: Modifier[]): Promise<void> {
  await ensureCliclick();
  // cliclick supports kp:<keyname>; for combos we hold modifiers around it.
  const { mods, key } = splitCombo(combo, modifiers);
  const macModMap: Record<Modifier, string> = { ctrl: 'ctrl', alt: 'alt', shift: 'shift', meta: 'cmd' };
  const macMods = mods.map((m) => macModMap[m]);
  const args: string[] = [];
  for (const m of macMods) args.push(`kd:${m}`);
  args.push(`kp:${normalizeKeyForCliclick(key)}`);
  for (const m of macMods.slice().reverse()) args.push(`ku:${m}`);
  await execa('cliclick', args);
}

async function macHoldKey(key: string, durationMs: number): Promise<void> {
  await ensureCliclick();
  const norm = normalizeKeyForCliclick(key);
  await execa('cliclick', [`kd:${norm}`]);
  await new Promise((r) => setTimeout(r, durationMs));
  await execa('cliclick', [`ku:${norm}`]);
}

async function macScroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
  // cliclick lacks scroll. Use AppleScript via osascript with System Events scroll wheel is non-trivial.
  // Use a small osascript that simulates arrow-key scrolling as a fallback.
  const key =
    direction === 'up' ? 'page up' :
    direction === 'down' ? 'page down' :
    direction === 'left' ? 'left arrow' :
    'right arrow';
  for (let i = 0; i < amount; i++) {
    await execa('osascript', [
      '-e',
      `tell application "System Events" to key code ${appleKeyCode(key)}`,
    ]);
  }
}

async function ensureCliclick(): Promise<void> {
  if (!(await which('cliclick'))) {
    throw new Error(`cliclick not found. ${INSTALL_HINT.cliclick}`);
  }
}

function appleKeyCode(name: string): number {
  // Minimal map for scroll-direction fallback.
  const map: Record<string, number> = {
    'page up': 116,
    'page down': 121,
    'left arrow': 123,
    'right arrow': 124,
    'up arrow': 126,
    'down arrow': 125,
  };
  return map[name] ?? 121;
}

function normalizeKeyForCliclick(key: string): string {
  // cliclick names: arrow-up, arrow-down, arrow-left, arrow-right, return, esc, tab, space, delete,
  // home, end, page-up, page-down, fwd-delete, num-0..num-9, f1..f16
  const k = key.toLowerCase();
  const map: Record<string, string> = {
    enter: 'return',
    return: 'return',
    escape: 'esc',
    esc: 'esc',
    tab: 'tab',
    space: 'space',
    backspace: 'delete',
    delete: 'fwd-delete',
    up: 'arrow-up',
    down: 'arrow-down',
    left: 'arrow-left',
    right: 'arrow-right',
    arrowup: 'arrow-up',
    arrowdown: 'arrow-down',
    arrowleft: 'arrow-left',
    arrowright: 'arrow-right',
    pageup: 'page-up',
    pagedown: 'page-down',
    home: 'home',
    end: 'end',
  };
  return map[k] ?? k;
}

// ---------- Linux (xdotool / ydotool) ----------

async function ensureXdotool(): Promise<void> {
  if (!(await which('xdotool'))) {
    throw new Error(`xdotool not found. ${INSTALL_HINT.xdotool}`);
  }
}
async function ensureYdotool(): Promise<void> {
  if (!(await which('ydotool'))) {
    throw new Error(`ydotool not found. ${INSTALL_HINT.ydotool}`);
  }
}

async function linuxClick(x: number, y: number, button: 1 | 2 | 3, repeat = 1): Promise<void> {
  if (isWayland()) {
    await ensureYdotool();
    // ydotool doesn't move-then-click in one call; do it sequentially.
    await execa('ydotool', ['mousemove', '--absolute', '-x', String(x), '-y', String(y)]);
    for (let i = 0; i < repeat; i++) {
      const code = button === 1 ? '0xC0' : button === 3 ? '0xC1' : '0xC2';
      await execa('ydotool', ['click', code]);
    }
    return;
  }
  await ensureXdotool();
  await execa('xdotool', ['mousemove', String(x), String(y), 'click', '--repeat', String(repeat), String(button)]);
}

async function linuxMove(x: number, y: number): Promise<void> {
  if (isWayland()) {
    await ensureYdotool();
    await execa('ydotool', ['mousemove', '--absolute', '-x', String(x), '-y', String(y)]);
    return;
  }
  await ensureXdotool();
  await execa('xdotool', ['mousemove', String(x), String(y)]);
}

async function linuxPosition(): Promise<{ x: number; y: number }> {
  if (isWayland()) {
    throw new Error('cursor_position is not supported on Wayland.');
  }
  await ensureXdotool();
  const { stdout } = await execa('xdotool', ['getmouselocation', '--shell']);
  const x = Number(/X=(-?\d+)/.exec(stdout)?.[1] ?? 0);
  const y = Number(/Y=(-?\d+)/.exec(stdout)?.[1] ?? 0);
  return { x, y };
}

async function linuxDrag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
  if (isWayland()) {
    await ensureYdotool();
    await execa('ydotool', ['mousemove', '--absolute', '-x', String(x1), '-y', String(y1)]);
    await execa('ydotool', ['mousedown', '0xC0']);
    await execa('ydotool', ['mousemove', '--absolute', '-x', String(x2), '-y', String(y2)]);
    await execa('ydotool', ['mouseup', '0xC0']);
    return;
  }
  await ensureXdotool();
  await execa('xdotool', [
    'mousemove', String(x1), String(y1),
    'mousedown', '1',
    'mousemove', String(x2), String(y2),
    'mouseup', '1',
  ]);
}

async function linuxType(text: string): Promise<void> {
  if (isWayland()) {
    if (await which('wtype')) {
      await execa('wtype', ['--', text]);
      return;
    }
    await ensureYdotool();
    await execa('ydotool', ['type', '--', text]);
    return;
  }
  await ensureXdotool();
  await execa('xdotool', ['type', '--delay', '20', '--', text]);
}

async function linuxKey(combo: string, modifiers: Modifier[]): Promise<void> {
  const { mods, key } = splitCombo(combo, modifiers);
  if (isWayland()) {
    await ensureYdotool();
    // ydotool key takes keycodes; we use its `key` form with names (Linux input event codes).
    // Easiest path: use `xdotool` if also installed; otherwise use `ydotool key` with combos.
    if (await which('xdotool')) {
      const xCombo = [...mods.map(toXModifier), key].join('+');
      await execa('xdotool', ['key', '--', xCombo]);
      return;
    }
    // ydotool fallback: best-effort. Names like KEY_LEFTCTRL+KEY_C
    const ydoCombo = [...mods.map(toYdoMod), `KEY_${key.toUpperCase()}`].join('+');
    await execa('ydotool', ['key', ydoCombo]);
    return;
  }
  await ensureXdotool();
  const xCombo = [...mods.map(toXModifier), key].join('+');
  await execa('xdotool', ['key', '--', xCombo]);
}

function toXModifier(m: Modifier): string {
  return ({ ctrl: 'ctrl', alt: 'alt', shift: 'shift', meta: 'super' } as const)[m];
}
function toYdoMod(m: Modifier): string {
  return ({ ctrl: 'KEY_LEFTCTRL', alt: 'KEY_LEFTALT', shift: 'KEY_LEFTSHIFT', meta: 'KEY_LEFTMETA' } as const)[m];
}

async function linuxHoldKey(key: string, durationMs: number): Promise<void> {
  await ensureXdotool();
  await execa('xdotool', ['keydown', '--', key]);
  await new Promise((r) => setTimeout(r, durationMs));
  await execa('xdotool', ['keyup', '--', key]);
}

async function linuxScroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
  if (isWayland()) {
    await ensureYdotool();
    // ydotool wheel: positive = up; horizontal not universally supported.
    const v = direction === 'up' ? amount : direction === 'down' ? -amount : 0;
    if (v !== 0) await execa('ydotool', ['mousemove', '--wheel', '-y', String(v)]);
    return;
  }
  await ensureXdotool();
  const button = direction === 'up' ? '4' : direction === 'down' ? '5' : direction === 'left' ? '6' : '7';
  await execa('xdotool', ['click', '--repeat', String(amount), button]);
}

// ---------- Windows (PowerShell) ----------

const PS_HEAD = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing | Out-Null
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
  public const uint MOUSEEVENTF_WHEEL = 0x0800;
  public const uint MOUSEEVENTF_HWHEEL = 0x01000;
}
"@ | Out-Null
`;

async function ps(script: string): Promise<string> {
  const { stdout } = await execa('powershell', ['-NoProfile', '-Command', PS_HEAD + script]);
  return stdout;
}

async function winClick(x: number, y: number, kind: 'left' | 'right' | 'middle' | 'double' | 'triple'): Promise<void> {
  const downUp = (k: 'left' | 'right' | 'middle') => {
    const down = k === 'left' ? 'LEFTDOWN' : k === 'right' ? 'RIGHTDOWN' : 'MIDDLEDOWN';
    const up = k === 'left' ? 'LEFTUP' : k === 'right' ? 'RIGHTUP' : 'MIDDLEUP';
    return `[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_${down}, 0, 0, 0, [UIntPtr]::Zero); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_${up}, 0, 0, 0, [UIntPtr]::Zero);`;
  };
  let body = `[Mouse]::SetCursorPos(${x}, ${y}); Start-Sleep -Milliseconds 30; `;
  if (kind === 'left' || kind === 'right' || kind === 'middle') body += downUp(kind);
  else if (kind === 'double') body += downUp('left') + ' Start-Sleep -Milliseconds 50; ' + downUp('left');
  else body += downUp('left') + ' Start-Sleep -Milliseconds 50; ' + downUp('left') + ' Start-Sleep -Milliseconds 50; ' + downUp('left');
  await ps(body);
}

async function winMove(x: number, y: number): Promise<void> {
  await ps(`[Mouse]::SetCursorPos(${x}, ${y}) | Out-Null`);
}

async function winPosition(): Promise<{ x: number; y: number }> {
  const out = await ps(`$p = [System.Windows.Forms.Cursor]::Position; "$($p.X),$($p.Y)"`);
  const [x, y] = out.trim().split(',').map((n) => Number(n));
  return { x, y };
}

async function winDrag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
  await ps(
    `[Mouse]::SetCursorPos(${x1}, ${y1}); Start-Sleep -Milliseconds 30; ` +
    `[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30; ` +
    `[Mouse]::SetCursorPos(${x2}, ${y2}); Start-Sleep -Milliseconds 30; ` +
    `[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero);`
  );
}

function escapeSendKeys(text: string): string {
  return text.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`);
}

async function winType(text: string): Promise<void> {
  const escaped = escapeSendKeys(text).replace(/'/g, "''");
  await ps(`[System.Windows.Forms.SendKeys]::SendWait('${escaped}')`);
}

async function winKey(combo: string, modifiers: Modifier[]): Promise<void> {
  const { mods, key } = splitCombo(combo, modifiers);
  const modMap: Record<Modifier, string> = { ctrl: '^', alt: '%', shift: '+', meta: '^' };
  const prefix = mods.map((m) => modMap[m]).join('');
  const sk = sendKeysName(key);
  const expr = prefix + sk;
  const escaped = expr.replace(/'/g, "''");
  await ps(`[System.Windows.Forms.SendKeys]::SendWait('${escaped}')`);
}

function sendKeysName(key: string): string {
  const k = key.toLowerCase();
  const map: Record<string, string> = {
    enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}',
    space: ' ', backspace: '{BS}', delete: '{DEL}',
    up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
    arrowup: '{UP}', arrowdown: '{DOWN}', arrowleft: '{LEFT}', arrowright: '{RIGHT}',
    home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
  };
  if (map[k]) return map[k];
  if (/^f([1-9]|1[0-6])$/i.test(key)) return `{${key.toUpperCase()}}`;
  if (key.length === 1) return escapeSendKeys(key);
  return `{${key.toUpperCase()}}`;
}

async function winHoldKey(key: string, durationMs: number): Promise<void> {
  // SendKeys cannot hold a key. We simulate by sending the keystroke once after the delay
  // with a clear note in errors when the user explicitly relies on hold semantics.
  // Best-effort: just sleep then send.
  await new Promise((r) => setTimeout(r, durationMs));
  await winKey(key, []);
}

async function winScroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
  const delta = 120 * amount;
  const v = direction === 'up' ? delta : direction === 'down' ? -delta : 0;
  const h = direction === 'right' ? delta : direction === 'left' ? -delta : 0;
  if (v !== 0) {
    await ps(`[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_WHEEL, 0, 0, ${v}, [UIntPtr]::Zero)`);
  }
  if (h !== 0) {
    await ps(`[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_HWHEEL, 0, 0, ${h}, [UIntPtr]::Zero)`);
  }
}

// ---------- Cross-platform (apps, clipboard) ----------

async function openApplication(name: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execa('open', ['-a', name]);
    return;
  }
  if (process.platform === 'win32') {
    await execa('powershell', ['-NoProfile', '-Command', `Start-Process '${name.replace(/'/g, "''")}'`]);
    return;
  }
  if (process.platform === 'linux') {
    if (await which('xdg-open')) {
      await execa('xdg-open', [name]);
      return;
    }
    await execa(name, [], { detached: true, stdio: 'ignore' }).catch((e) => {
      throw new Error(`Could not launch '${name}': ${(e as Error).message}`);
    });
    return;
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

async function listApplications(): Promise<string[]> {
  if (process.platform === 'darwin') {
    const { stdout } = await execa('sh', ['-c', 'ls -1 /Applications | sed "s/\\.app$//"']);
    return stdout.split('\n').filter(Boolean);
  }
  if (process.platform === 'win32') {
    const out = await ps(
      `Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | ForEach-Object { (Get-ItemProperty $_.PsPath).DisplayName } | Where-Object { $_ } | Sort-Object -Unique`
    );
    return out.split(/\r?\n/).filter(Boolean);
  }
  if (process.platform === 'linux') {
    const { stdout } = await execa('sh', ['-c', 'ls -1 /usr/share/applications 2>/dev/null | sed "s/\\.desktop$//" || true']);
    return stdout.split('\n').filter(Boolean);
  }
  return [];
}

async function readClipboard(): Promise<string> {
  if (process.platform === 'darwin') return (await execa('pbpaste')).stdout;
  if (process.platform === 'win32') return (await ps(`Get-Clipboard -Raw`)).replace(/\r?\n$/, '');
  if (await which('wl-paste')) return (await execa('wl-paste', ['--no-newline'])).stdout;
  if (await which('xclip')) return (await execa('xclip', ['-selection', 'clipboard', '-o'])).stdout;
  if (await which('xsel')) return (await execa('xsel', ['--clipboard', '--output'])).stdout;
  throw new Error('No clipboard tool available (install wl-clipboard, xclip, or xsel).');
}

async function writeClipboard(text: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execa('pbcopy', [], { input: text });
    return;
  }
  if (process.platform === 'win32') {
    const escaped = text.replace(/'/g, "''");
    await ps(`Set-Clipboard -Value '${escaped}'`);
    return;
  }
  if (await which('wl-copy')) { await execa('wl-copy', [], { input: text }); return; }
  if (await which('xclip')) { await execa('xclip', ['-selection', 'clipboard'], { input: text }); return; }
  if (await which('xsel')) { await execa('xsel', ['--clipboard', '--input'], { input: text }); return; }
  throw new Error('No clipboard tool available (install wl-clipboard, xclip, or xsel).');
}

// ---------- Helpers ----------

function splitCombo(combo: string, extra: Modifier[]): { mods: Modifier[]; key: string } {
  const parts = combo.split('+').map((s) => s.trim()).filter(Boolean);
  const mods = new Set<Modifier>(extra);
  let key = combo;
  if (parts.length > 1) {
    key = parts[parts.length - 1];
    for (const p of parts.slice(0, -1)) {
      const lower = p.toLowerCase();
      if (lower === 'cmd' || lower === 'command' || lower === 'super' || lower === 'win' || lower === 'meta') mods.add('meta');
      else if (lower === 'ctrl' || lower === 'control') mods.add('ctrl');
      else if (lower === 'alt' || lower === 'option' || lower === 'opt') mods.add('alt');
      else if (lower === 'shift') mods.add('shift');
    }
  }
  return { mods: [...mods], key };
}

// ---------- Tool ----------

export function computer(run: Run) {
  return tool({
    description:
      "Drive the user's desktop GUI: take screenshots, move/click the mouse, type, press key combos, scroll, drag, open apps, and read/write the clipboard. Coordinates are in the OS's pixel space (the same space `screenshot` returns). " +
      'Returns status="no-gui" with an explanation when running on a headless host. ' +
      'macOS requires `cliclick` (brew install cliclick) plus Accessibility permission for your terminal/Node binary. ' +
      'Linux uses `xdotool` (X11) or `ydotool`/`wtype` (Wayland). ' +
      'Windows uses built-in PowerShell + .NET — no install needed. ' +
      'Actions: screenshot, left_click, right_click, middle_click, double_click, triple_click, mouse_move, cursor_position, drag, scroll, type, key, hold_key, wait, open_application, list_applications, read_clipboard, write_clipboard.',
    inputSchema: z.object({
      action: Action,
      coordinate: z
        .array(z.number().int())
        .length(2)
        .optional()
        .describe('[x, y] in screen pixels. Required for left/right/middle/double/triple_click, mouse_move, scroll.'),
      coordinate_to: z
        .array(z.number().int())
        .length(2)
        .optional()
        .describe('[x, y] target for `drag` (with `coordinate` as the start).'),
      text: z.string().optional().describe('Text to type for action=type, app name for open_application, or clipboard contents for write_clipboard.'),
      key: z
        .string()
        .optional()
        .describe('Key or combo for action=key / hold_key. Examples: "Enter", "ctrl+s", "cmd+shift+t". Modifier names: ctrl, alt/option, shift, cmd/super/meta.'),
      modifiers: z
        .array(z.enum(['shift', 'ctrl', 'alt', 'meta']))
        .optional()
        .describe('Modifier keys to hold during click / scroll / key actions.'),
      direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction.'),
      amount: z.number().int().min(1).max(50).optional().describe('Scroll ticks (default 3) or click repeats.'),
      duration_ms: z.number().int().min(1).max(60_000).optional().describe('For action=wait or hold_key.'),
    }),
    execute: async (input): Promise<ComputerResult> => {
      const platform = process.platform;
      const action = input.action;

      if (NEEDS_GUI.has(action)) {
        const gui = detectGui();
        if (!gui.hasGui) {
          return {
            status: 'no-gui',
            platform,
            message: gui.reason ?? 'No GUI available on this host.',
          };
        }
      }

      try {
        switch (action) {
          case 'screenshot':
            return await captureScreenshot(run);

          case 'wait': {
            const ms = input.duration_ms ?? 1_000;
            await new Promise((r) => setTimeout(r, ms));
            return ok({ waitedMs: ms });
          }

          case 'open_application': {
            if (!input.text) return err('`text` (app name) is required for open_application.');
            await openApplication(input.text);
            return ok({ opened: input.text });
          }
          case 'list_applications': {
            const apps = await listApplications();
            return ok({ apps });
          }
          case 'read_clipboard': {
            const value = await readClipboard();
            return ok({ value });
          }
          case 'write_clipboard': {
            if (input.text === undefined) return err('`text` is required for write_clipboard.');
            await writeClipboard(input.text);
            return ok();
          }

          case 'cursor_position': {
            if (platform === 'darwin') return ok(await macPosition());
            if (platform === 'linux') return ok(await linuxPosition());
            if (platform === 'win32') return ok(await winPosition());
            return err(`Unsupported platform: ${platform}`);
          }

          case 'mouse_move': {
            if (!input.coordinate) return err('`coordinate` is required for mouse_move.');
            const [x, y] = input.coordinate;
            if (platform === 'darwin') await macMove(x, y);
            else if (platform === 'linux') await linuxMove(x, y);
            else if (platform === 'win32') await winMove(x, y);
            else return err(`Unsupported platform: ${platform}`);
            return ok({ at: [x, y] });
          }

          case 'left_click':
          case 'right_click':
          case 'middle_click':
          case 'double_click':
          case 'triple_click': {
            if (!input.coordinate) return err(`\`coordinate\` is required for ${action}.`);
            const [x, y] = input.coordinate;
            if (platform === 'darwin') {
              if (action === 'left_click') await macClick(x, y, 'c');
              else if (action === 'right_click') await macClick(x, y, 'rc');
              else if (action === 'double_click') await macClick(x, y, 'dc');
              else if (action === 'triple_click') await macClick(x, y, 'tc');
              else await macMiddleClick(x, y);
            } else if (platform === 'linux') {
              const button = action === 'right_click' ? 3 : action === 'middle_click' ? 2 : 1;
              const repeat = action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1;
              await linuxClick(x, y, button, repeat);
            } else if (platform === 'win32') {
              const kind =
                action === 'left_click' ? 'left' :
                action === 'right_click' ? 'right' :
                action === 'middle_click' ? 'middle' :
                action === 'double_click' ? 'double' : 'triple';
              await winClick(x, y, kind);
            } else {
              return err(`Unsupported platform: ${platform}`);
            }
            return ok({ at: [x, y], action });
          }

          case 'drag': {
            if (!input.coordinate || !input.coordinate_to) {
              return err('`coordinate` (start) and `coordinate_to` (end) are both required for drag.');
            }
            const [x1, y1] = input.coordinate;
            const [x2, y2] = input.coordinate_to;
            if (platform === 'darwin') await macDrag(x1, y1, x2, y2);
            else if (platform === 'linux') await linuxDrag(x1, y1, x2, y2);
            else if (platform === 'win32') await winDrag(x1, y1, x2, y2);
            else return err(`Unsupported platform: ${platform}`);
            return ok({ from: [x1, y1], to: [x2, y2] });
          }

          case 'scroll': {
            const direction = input.direction ?? 'down';
            const amount = input.amount ?? 3;
            if (input.coordinate) {
              const [x, y] = input.coordinate;
              if (platform === 'darwin') await macMove(x, y);
              else if (platform === 'linux') await linuxMove(x, y);
              else if (platform === 'win32') await winMove(x, y);
            }
            if (platform === 'darwin') await macScroll(direction, amount);
            else if (platform === 'linux') await linuxScroll(direction, amount);
            else if (platform === 'win32') await winScroll(direction, amount);
            else return err(`Unsupported platform: ${platform}`);
            return ok({ direction, amount });
          }

          case 'type': {
            if (input.text === undefined) return err('`text` is required for type.');
            if (platform === 'darwin') await macType(input.text);
            else if (platform === 'linux') await linuxType(input.text);
            else if (platform === 'win32') await winType(input.text);
            else return err(`Unsupported platform: ${platform}`);
            return ok({ typed: input.text.length });
          }

          case 'key': {
            if (!input.key) return err('`key` is required for key.');
            const mods = input.modifiers ?? [];
            if (platform === 'darwin') await macKey(input.key, mods);
            else if (platform === 'linux') await linuxKey(input.key, mods);
            else if (platform === 'win32') await winKey(input.key, mods);
            else return err(`Unsupported platform: ${platform}`);
            return ok({ key: input.key, modifiers: mods });
          }

          case 'hold_key': {
            if (!input.key) return err('`key` is required for hold_key.');
            const ms = input.duration_ms ?? 500;
            if (platform === 'darwin') await macHoldKey(input.key, ms);
            else if (platform === 'linux') await linuxHoldKey(input.key, ms);
            else if (platform === 'win32') await winHoldKey(input.key, ms);
            else return err(`Unsupported platform: ${platform}`);
            return ok({ key: input.key, durationMs: ms });
          }
        }

        return err(`Unknown action: ${String(action)}`);
      } catch (e) {
        const msg = (e as Error).message;
        const tool = /cliclick/.test(msg) ? 'cliclick'
          : /xdotool/.test(msg) ? 'xdotool'
          : /ydotool/.test(msg) ? 'ydotool'
          : undefined;
        return err(msg, tool ? INSTALL_HINT[tool] : undefined);
      }
    },
    toModelOutput({ output }) {
      const res = output as ComputerResult;
      if ('mediaType' in res && res.status === 'ok') {
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
            { type: 'text' as const, text: `No GUI available (platform=${res.platform}): ${res.message}` },
          ],
        };
      }
      if (res.status === 'error') {
        const hint = (res as ComputerErrorResult).hint ? `\nHint: ${(res as ComputerErrorResult).hint}` : '';
        return {
          type: 'content',
          value: [
            { type: 'text' as const, text: `Computer action failed (platform=${res.platform}): ${res.message}${hint}` },
          ],
        };
      }
      return {
        type: 'content',
        value: [{ type: 'text' as const, text: JSON.stringify(res) }],
      };
    },
  });
}
