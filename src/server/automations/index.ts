import { SubmoduleFastyclawAutomationsStore } from '@/server/automations/store';
import { SubmoduleFastyclawAutomationsRunner } from '@/server/automations/runner';
import { SubmoduleFastyclawAutomationsScheduler } from '@/server/automations/scheduler';

export class FastyclawAutomations {
  public static readonly store = new SubmoduleFastyclawAutomationsStore();
  public static readonly runner = new SubmoduleFastyclawAutomationsRunner(FastyclawAutomations.store);
  public static readonly scheduler = new SubmoduleFastyclawAutomationsScheduler(
    FastyclawAutomations.store,
    FastyclawAutomations.runner,
  );
}
