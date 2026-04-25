import { z } from 'zod';
import { tool } from 'ai';
import type { Run } from '@/server/types';
import { FastyclawAutomations } from '@/server/automations/index';

export function cancelAutomation(_run: Run) {
  return tool({
    description: 'Cancel (delete) a scheduled automation by id. Use after `list_automations` to find the right id.',
    inputSchema: z.object({
      id: z.string().describe('Automation id (8-char) returned by list_automations or schedule_automation.'),
    }),
    execute: async ({ id }) => {
      const ok = await FastyclawAutomations.store.delete(id);
      if (!ok) return { ok: false, error: `automation not found: ${id}` };
      return { ok: true, id };
    },
  });
}
