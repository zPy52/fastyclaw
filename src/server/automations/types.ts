export type Trigger =
  | { kind: 'cron'; expr: string }
  | { kind: 'interval'; everyMs: number }
  | { kind: 'once'; at: string };

export type Mode =
  | { kind: 'fresh' }
  | { kind: 'attach'; threadId: string };

export interface Automation {
  id: string;
  name: string;
  description: string;
  prompt: string;
  trigger: Trigger;
  mode: Mode;
  cwd?: string;
  model?: string;
  enabled: boolean;
  createdAt: string;
  createdBy: 'agent' | 'http' | 'cli';
  lastFiredAt?: string;
  lastError?: string;
}

export type SkipReason = 'busy' | 'disabled' | 'expired';

export interface AutomationRun {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  threadId: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  reason?: SkipReason;
}

export interface CreateAutomationInput {
  name: string;
  description: string;
  prompt: string;
  trigger: Trigger;
  mode?: Mode;
  cwd?: string;
  model?: string;
  enabled?: boolean;
  createdBy?: 'agent' | 'http' | 'cli';
}
