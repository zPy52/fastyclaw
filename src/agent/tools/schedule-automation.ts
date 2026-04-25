import { z } from 'zod';
import { tool } from 'ai';
import type { Run } from '@/server/types';
import { FastyclawAutomations } from '@/server/automations/index';

const triggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cron'), expr: z.string().min(1) }),
  z.object({ kind: z.literal('interval'), everyMs: z.number().int().min(60_000) }),
  z.object({ kind: z.literal('once'), at: z.string().min(1) }),
]);

const modeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fresh') }),
  z.object({ kind: z.literal('attach'), threadId: z.string().min(1) }),
]).optional();

export function scheduleAutomation(_run: Run) {
  return tool({
    description:
      'Schedule a future or recurring prompt back to this agent. Use when the user asks for a routine ' +
      '("every morning at 5am call this API and run the report skill", "remind me in 2 hours to check CI"). ' +
      'The scheduled prompt fires in a fresh thread by default; pass mode={kind:"attach",threadId} to keep ' +
      'the conversation continuing in this thread. Triggers: cron (5-field, local TZ), interval (>=60000 ms), once (ISO date).',
    inputSchema: z.object({
      name: z.string().regex(/^[a-z0-9-]+$/).describe('Unique kebab-case name.'),
      description: z.string().describe('Short human-readable description shown when listing automations.'),
      prompt: z.string().describe('User-style message that will be sent to the agent when the trigger fires.'),
      trigger: triggerSchema,
      mode: modeSchema,
      cwd: z.string().optional().describe('Override working directory for the run.'),
      model: z.string().optional().describe('Override model id for the run.'),
    }),
    execute: async (input) => {
      const created = await FastyclawAutomations.store.create({
        name: input.name,
        description: input.description,
        prompt: input.prompt,
        trigger: input.trigger,
        mode: input.mode ?? { kind: 'fresh' },
        cwd: input.cwd,
        model: input.model,
        enabled: true,
        createdBy: 'agent',
      });
      return {
        id: created.id,
        name: created.name,
        trigger: created.trigger,
        mode: created.mode,
        enabled: created.enabled,
      };
    },
  });
}
