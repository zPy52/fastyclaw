import type { Session } from '../../server/types.js';
import { browser } from './browser.js';
import { editFile } from './edit-file.js';
import { fileSearch } from './file-search.js';
import { getRules } from './get-rules.js';
import { readFile } from './read-file.js';
import { runShell } from './run-shell.js';
import { semanticSearch } from './semantic-search.js';
import { webFetch } from './web-fetch.js';

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
