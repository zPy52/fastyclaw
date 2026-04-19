import type { Skill } from '@/skills/types';

export class SubmoduleAgentSkillsRegistry {
  private skills = new Map<string, Skill>();

  public set(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  public get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  public list(): Skill[] {
    return Array.from(this.skills.values());
  }

  public clear(): void {
    this.skills.clear();
  }
}
