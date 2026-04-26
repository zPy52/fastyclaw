import { SubmoduleAgentRuntimeLoop } from '@/agent/loop';
import { SubmoduleAgentRuntimePrompt } from '@/agent/prompt';
import { SubmoduleAgentRuntimeProvider } from '@/agent/provider/index';
import { SubmoduleAgentRuntimeCompaction } from '@/agent/compaction/index';

export class AgentRuntime {
  public static readonly prompt = new SubmoduleAgentRuntimePrompt();
  public static readonly provider = new SubmoduleAgentRuntimeProvider();
  public static readonly compaction = SubmoduleAgentRuntimeCompaction.create(AgentRuntime.provider);
  public static readonly loop = new SubmoduleAgentRuntimeLoop(
    AgentRuntime.prompt,
    AgentRuntime.provider,
    AgentRuntime.compaction,
  );
}
