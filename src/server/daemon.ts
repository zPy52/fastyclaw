import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Const } from '@/config/index';

export interface AgentState {
  name: string;
  pid: number;
  port: number;
  host: string;
  startedAt: string;
  version: string;
}

export function spawnDaemon(args: { name: string; port?: number }): { pid: number } {
  fs.mkdirSync(Const.agentDir, { recursive: true });
  const out = fs.openSync(Const.logPath, 'a');
  const err = fs.openSync(Const.errPath, 'a');
  const child = spawn(process.execPath, [process.argv[1], '__run-daemon'], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      FASTYCLAW_AGENT_NAME: args.name,
      FASTYCLAW_AGENT_DIR: Const.agentDir,
      FASTYCLAW_PORT: args.port ? String(args.port) : '',
      FASTYCLAW_DAEMON: '1',
    },
  });
  fs.closeSync(out);
  fs.closeSync(err);
  child.unref();
  return { pid: child.pid ?? 0 };
}

export function pickFreePort(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(port, Const.host, () => srv.close(() => resolve(port)));
    srv.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') resolve(pickFreePort(port + 1));
      else reject(err);
    });
  });
}

export function readState(): AgentState | null {
  try {
    const state = JSON.parse(fs.readFileSync(Const.statePath, 'utf8')) as AgentState;
    if (!Number.isInteger(state.pid) || !Number.isInteger(state.port)) return null;
    if (!pidAlive(state.pid)) {
      removeStateFiles();
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export async function readStateFor(name: string): Promise<AgentState | null> {
  Const.bind(name);
  return readState();
}

export async function waitForState(timeoutMs: number): Promise<AgentState | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = readState();
    if (state) return state;
    await sleep(50);
  }
  return null;
}

export async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!pidAlive(pid)) return true;
    await sleep(100);
  }
  return !pidAlive(pid);
}

export async function listAgentNames(): Promise<string[]> {
  const agentsDir = path.join(os.homedir(), '.fastyclaw', 'agents');
  try {
    const entries = await fsp.readdir(agentsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export function removeStateFiles(): void {
  try { fs.rmSync(Const.statePath, { force: true }); } catch { /* ignore */ }
  try { fs.rmSync(Const.pidPath, { force: true }); } catch { /* ignore */ }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
