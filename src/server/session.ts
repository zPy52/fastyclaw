import crypto from 'node:crypto';
import { Const } from '../config/index.js';
import { closeBrowser } from '../agent/tools/browser.js';
import { SubmoduleFastyclawServerStream } from './stream.js';
import type { Session, SessionConfig } from './types.js';

export class SubmoduleFastyclawServerSession {
  private sessions = new Map<string, Session>();

  public create(): Session {
    const id = crypto.randomUUID();
    const abort = new AbortController();
    const stream = new SubmoduleFastyclawServerStream();

    const config: SessionConfig = {
      model: Const.defaultModel,
      provider: Const.defaultProvider,
      cwd: process.cwd(),
    };

    const session: Session = {
      id,
      config,
      messages: [],
      abort,
      stream,
      close: () => {
        try {
          abort.abort();
        } catch {
          // ignore
        }
        stream.end();
        void closeBrowser(session);
      },
    };

    this.sessions.set(id, session);
    return session;
  }

  public get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  public remove(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.close();
    this.sessions.delete(id);
    return true;
  }
}
