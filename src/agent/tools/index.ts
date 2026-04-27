import { sleep } from '@/agent/tools/sleep';
import type { Run } from '@/server/types';
import { browser } from '@/agent/tools/browser';
import { computer } from '@/agent/tools/computer';
import { editFile } from '@/agent/tools/edit-file';
import { readFile } from '@/agent/tools/read-file';
import { runShell } from '@/agent/tools/run-shell';
import { seeImage } from '@/agent/tools/see-image';
import { webFetch } from '@/agent/tools/web-fetch';
import { checkShell } from '@/agent/tools/check-shell';
import { fileSearch } from '@/agent/tools/file-search';
import { screenshot } from '@/agent/tools/screenshot';
import { sendFiles } from '@/agent/tools/send-files';
import { scheduleAutomation } from '@/agent/tools/schedule-automation';
import { listAutomations } from '@/agent/tools/list-automations';
import { cancelAutomation } from '@/agent/tools/cancel-automation';

export class AgentTools {
  public static all(run: Run) {
    return {
      file_search: fileSearch(run),
      web_fetch: webFetch(run),
      read_file: readFile(run),
      edit_file: editFile(run),
      run_shell: runShell(run),
      sleep: sleep(run),
      check_shell: checkShell(run),
      browser: browser(run),
      computer: computer(run),
      see_image: seeImage(run),
      screenshot: screenshot(run),
      send_files: sendFiles(run),
      schedule_automation: scheduleAutomation(run),
      list_automations: listAutomations(run),
      cancel_automation: cancelAutomation(run),
    };
  }
}
