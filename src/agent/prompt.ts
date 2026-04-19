import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '@/server/types';
import { AgentSkills } from '@/skills/index';

export class SubmoduleAgentRuntimePrompt {
  private loadGuidance(cwd: string): string {
    const parts: string[] = [];
    let dir = path.resolve(cwd);

    while (true) {
      const file = path.join(dir, 'AGENTS.md');
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8').trim();
        if (content) parts.unshift(`# ${file}\n\n${content}`);
      }

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return parts.join('\n\n---\n\n');
  }

  public build(run: Run): string {
    const skills = AgentSkills.prompt.render();
    const agentsGuidance = this.loadGuidance(run.config.cwd);
    const parts: string[] = [];
    parts.push(
      [
        'You are fastyclaw, a local coding agent running on the user\'s machine.',
        'You have a fixed set of tools to read/edit files, search, run shell commands, fetch web pages, and drive a headless browser.',
        'Operate inside the configured working directory. Prefer small, verifiable steps. Call tools as needed until the task is complete.',
      ].join(' ')
    );
    parts.push(`Current working directory: ${run.config.cwd}`);
    parts.push(`Model: ${run.config.model} (provider: ${run.config.provider})`);
    parts.push(`Thread id: ${run.threadId}`);
    if (skills) parts.push(skills);
    if (agentsGuidance) {
      parts.push(['## AGENTS.md Guidance', agentsGuidance].join('\n\n'));
    }
    parts.push(
      [
        '## Rules',
        '- Follow any AGENTS.md guidance included in this prompt.',
        '- Prefer read_file and file_search over run_shell for reading and discovery.',
        '- When editing, keep the `old` string unique unless you intend replaceAll.',
        '- Do not print secrets or environment variables.',
      ].join('\n')
    );
    return parts.join('\n\n');
  }
}
