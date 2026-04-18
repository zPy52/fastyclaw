import type { SubmoduleAgentSkillsRegistry } from './registry.js';

export class SubmoduleAgentSkillsPrompt {
  public constructor(private readonly registry: SubmoduleAgentSkillsRegistry) {}

  public render(): string {
    const skills = this.registry.list();
    if (skills.length === 0) return '';
    const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
    return ['## Available skills', ...lines].join('\n');
  }

  public body(name: string): string | undefined {
    return this.registry.get(name)?.body;
  }
}
