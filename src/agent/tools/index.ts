import { sleep } from '@/agent/tools/sleep';
import type { Run } from '@/server/types';
import { browser } from '@/agent/tools/browser';
import { editFile } from '@/agent/tools/edit-file';
import { readFile } from '@/agent/tools/read-file';
import { runShell } from '@/agent/tools/run-shell';
import { seeImage } from '@/agent/tools/see-image';
import { webFetch } from '@/agent/tools/web-fetch';
import { checkShell } from '@/agent/tools/check-shell';
import { fileSearch } from '@/agent/tools/file-search';
import { screenshot } from '@/agent/tools/screenshot';

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
      see_image: seeImage(run),
      screenshot: screenshot(run),
    };
  }
}
