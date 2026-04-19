import { SubmoduleAgentRuntimeLoop } from '@/agent/loop';
import { SubmoduleAgentRuntimePrompt } from '@/agent/prompt';
import { SubmoduleAgentRuntimeProvider } from '@/agent/provider';

export class AgentRuntime {
  public static readonly prompt = new SubmoduleAgentRuntimePrompt();
  public static readonly provider = new SubmoduleAgentRuntimeProvider();
  public static readonly loop = new SubmoduleAgentRuntimeLoop(AgentRuntime.prompt, AgentRuntime.provider);
}
