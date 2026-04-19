import { AgentSkills } from '@/skills/index';
import type { Session } from '@/server/types';

export class SubmoduleAgentRuntimePrompt {
  public build(session: Session): string {
    const skills = AgentSkills.prompt.render();
    const parts: string[] = [];
    parts.push(
      [
        'You are fastyclaw, a local coding agent running on the user\'s machine.',
        'You have a fixed set of tools to read/edit files, search, run shell commands, fetch web pages, and drive a headless browser.',
        'Operate inside the session working directory. Prefer small, verifiable steps. Call tools as needed until the task is complete.',
      ].join(' ')
    );
    parts.push(`Current working directory: ${session.config.cwd}`);
    parts.push(`Model: ${session.config.model} (provider: ${session.config.provider})`);
    if (skills) parts.push(skills);
    parts.push(
      [
        '## Rules',
        '- Use get_rules once per session to load AGENTS.md guidance if present.',
        '- Prefer read_file and file_search over run_shell for reading and discovery.',
        '- When editing, keep the `old` string unique unless you intend replaceAll.',
        '- Do not print secrets or environment variables.',
      ].join('\n')
    );
    return parts.join('\n\n');
  }
}
