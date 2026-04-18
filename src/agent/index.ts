import { SubmoduleAgentRuntimeLoop } from './loop.js';
import { SubmoduleAgentRuntimePrompt } from './prompt.js';
import { SubmoduleAgentRuntimeProvider } from './provider.js';

export class AgentRuntime {
  public static readonly prompt = new SubmoduleAgentRuntimePrompt();
  public static readonly provider = new SubmoduleAgentRuntimeProvider();
  public static readonly loop = new SubmoduleAgentRuntimeLoop(AgentRuntime.prompt, AgentRuntime.provider);
}
