import { SubmoduleAgentSkillsLoader } from '@/skills/loader';
import { SubmoduleAgentSkillsPrompt } from '@/skills/prompt';
import { SubmoduleAgentSkillsRegistry } from '@/skills/registry';

export class AgentSkills {
  public static readonly registry = new SubmoduleAgentSkillsRegistry();
  public static readonly loader = new SubmoduleAgentSkillsLoader(AgentSkills.registry);
  public static readonly prompt = new SubmoduleAgentSkillsPrompt(AgentSkills.registry);
}
