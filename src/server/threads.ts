import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Const } from '@/config/index';
import type { Thread } from '@/server/types';
import type { UIMessage } from 'ai';

export class SubmoduleFastyclawServerThreads {
  private active = new Map<string, Thread>();

  private fileFor(id: string): string {
    return path.join(Const.threadsDir, `${id}.json`);
  }

  public async create(): Promise<Thread> {
    await fs.mkdir(Const.threadsDir, { recursive: true });
    const id = crypto.randomUUID();
    const thread: Thread = { id, messages: [] };
    await this.save(thread);
    return thread;
  }

  public async load(id: string): Promise<Thread | null> {
    const cached = this.active.get(id);
    if (cached) return cached;
    try {
      const raw = await fs.readFile(this.fileFor(id), 'utf8');
      const messages = JSON.parse(raw) as UIMessage[];
      return { id, messages };
    } catch {
      return null;
    }
  }

  public async save(thread: Thread): Promise<void> {
    await fs.mkdir(Const.threadsDir, { recursive: true });
    await fs.writeFile(this.fileFor(thread.id), JSON.stringify(thread.messages), 'utf8');
  }

  public async remove(id: string): Promise<boolean> {
    this.active.delete(id);
    try {
      await fs.unlink(this.fileFor(id));
      return true;
    } catch {
      return false;
    }
  }

  public activate(thread: Thread): void {
    this.active.set(thread.id, thread);
  }

  public deactivate(id: string): void {
    this.active.delete(id);
  }

  public getActive(id: string): Thread | undefined {
    return this.active.get(id);
  }
}
