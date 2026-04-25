import { z } from 'zod';
import { tool } from 'ai';
import type { Run } from '@/server/types';
import { FastyclawAutomations } from '@/server/automations/index';

export function listAutomations(_run: Run) {
  return tool({
    description: 'List scheduled automations (id, name, description, trigger, mode, enabled, lastFiredAt). Prompt bodies are omitted.',
    inputSchema: z.object({}),
    execute: async () => {
      const items = FastyclawAutomations.store.list().map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        trigger: a.trigger,
        mode: a.mode,
        enabled: a.enabled,
        lastFiredAt: a.lastFiredAt,
        lastError: a.lastError,
      }));
      return { automations: items };
    },
  });
}
