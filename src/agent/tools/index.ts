import type { Session } from '@/server/types';
import { browser } from '@/agent/tools/browser';
import { editFile } from '@/agent/tools/edit-file';
import { fileSearch } from '@/agent/tools/file-search';
import { getRules } from '@/agent/tools/get-rules';
import { readFile } from '@/agent/tools/read-file';
import { runShell } from '@/agent/tools/run-shell';
import { semanticSearch } from '@/agent/tools/semantic-search';
import { webFetch } from '@/agent/tools/web-fetch';

export class AgentTools {
  public static all(session: Session) {
    return {
      semantic_search: semanticSearch(session),
      file_search: fileSearch(session),
      web_fetch: webFetch(session),
      get_rules: getRules(session),
      read_file: readFile(session),
      edit_file: editFile(session),
      run_shell: runShell(session),
      browser: browser(session),
    };
  }
}
