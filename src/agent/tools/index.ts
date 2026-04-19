import type { Session } from '@/server/types';
import { browser } from '@/agent/tools/browser';
import { checkShell } from '@/agent/tools/check-shell';
import { editFile } from '@/agent/tools/edit-file';
import { getRules } from '@/agent/tools/get-rules';
import { readFile } from '@/agent/tools/read-file';
import { runShell } from '@/agent/tools/run-shell';
import { seeImage } from '@/agent/tools/see-image';
import { sleep } from '@/agent/tools/sleep';
import { webFetch } from '@/agent/tools/web-fetch';
import { fileSearch } from '@/agent/tools/file-search';

export class AgentTools {
  public static all(session: Session) {
    return {
      file_search: fileSearch(session),
      web_fetch: webFetch(session),
      get_rules: getRules(session),
      read_file: readFile(session),
      edit_file: editFile(session),
      run_shell: runShell(session),
      sleep: sleep(session),
      check_shell: checkShell(session),
      browser: browser(session),
      see_image: seeImage(session),
    };
  }
}
