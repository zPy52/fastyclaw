import path from 'node:path';
import fs from 'node:fs/promises';
import type { UIMessage } from 'ai';
import { Const } from '@/config/index';

export class CompactionArchive {
  public async snapshot(threadId: string, messages: UIMessage[]): Promise<string> {
    const dir = path.join(Const.archiveDir, threadId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify(messages), 'utf8');
    return file;
  }

  public async list(threadId: string): Promise<string[]> {
    const dir = path.join(Const.archiveDir, threadId);
    try {
      const entries = await fs.readdir(dir);
      return entries
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => path.join(dir, name));
    } catch {
      return [];
    }
  }
}
