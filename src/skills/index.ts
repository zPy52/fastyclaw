import { SubmoduleAgentSkillsLoader } from './loader.js';
import { SubmoduleAgentSkillsPrompt } from './prompt.js';
import { SubmoduleAgentSkillsRegistry } from './registry.js';

export class AgentSkills {
  public static readonly registry = new SubmoduleAgentSkillsRegistry();
  public static readonly loader = new SubmoduleAgentSkillsLoader(AgentSkills.registry);
  public static readonly prompt = new SubmoduleAgentSkillsPrompt(AgentSkills.registry);
}
