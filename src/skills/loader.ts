import path from 'node:path';
import matter from 'gray-matter';
import fs from 'node:fs/promises';
import { Const } from '@/config/index';
import type { Skill } from '@/skills/types';
import type { SubmoduleAgentSkillsRegistry } from '@/skills/registry';

export class SubmoduleAgentSkillsLoader {
  public constructor(private readonly registry: SubmoduleAgentSkillsRegistry) {}

  public dir(): string {
    return Const.skillsDir;
  }

  public async load(): Promise<void> {
    const root = this.dir();
    let entries: string[];
    try {
      entries = await fs.readdir(root);
    } catch {
      return;
    }
    for (const entry of entries) {
      const skillDir = path.join(root, entry);
      const skillFile = path.join(skillDir, 'SKILL.md');
      try {
        const stat = await fs.stat(skillDir);
        if (!stat.isDirectory()) continue;
        const raw = await fs.readFile(skillFile, 'utf8');
        const parsed = matter(raw);
        const fm = parsed.data as Partial<Skill>;
        const skill: Skill = {
          name: (fm.name ?? entry).toString(),
          description: (fm.description ?? '').toString(),
          triggers: Array.isArray(fm.triggers) ? fm.triggers.map(String) : undefined,
          body: parsed.content.trim(),
          path: skillFile,
        };
        this.registry.set(skill);
      } catch {
        continue;
      }
    }
  }

  public async reload(): Promise<void> {
    this.registry.clear();
    await this.load();
  }
}
