import type { WebClient } from '@slack/web-api';
import type { UIMessage } from 'ai';
import { AgentRuntime } from '@/agent/index';
import { FastyclawServer } from '@/server/index';
import type { AppConfig, Run, SlackConfig, Thread } from '@/server/types';
import { closeTerminal } from '@/agent/sessions/terminal';
import { closeBrowserSession } from '@/agent/sessions/browser';
import { SlackStream } from '@/slack/stream';
import type { SubmoduleFastyclawSlackBot } from '@/slack/bot';
import type { SubmoduleFastyclawSlackChats } from '@/slack/chats';
import type {
  ChatMeta,
  SlackChannelKind,
  SlackEventKind,
  SlackIncomingEvent,
} from '@/slack/types';

export class SubmoduleFastyclawSlackHandler {
  private readonly ownTsByChannel = new Map<string, Set<string>>();

  public constructor(
    private readonly botModule: SubmoduleFastyclawSlackBot,
    private readonly chats: SubmoduleFastyclawSlackChats,
  ) {}

  public rememberOwnTs(channel: string, ts: string): void {
    let set = this.ownTsByChannel.get(channel);
    if (!set) {
      set = new Set<string>();
      this.ownTsByChannel.set(channel, set);
    }
    set.add(ts);
  }

  public isOwnThread(channel: string, threadTs: string | undefined): boolean {
    if (!threadTs) return false;
    const set = this.ownTsByChannel.get(channel);
    return set ? set.has(threadTs) : false;
  }

  public handle = async (
    kind: SlackEventKind,
    event: SlackIncomingEvent,
    client: WebClient,
  ): Promise<void> => {
    if (event.subtype) return;
    const ownBotId = this.botModule.botUserId();
    if (event.bot_id && ownBotId && event.bot_id === ownBotId) return;
    if (event.user && ownBotId && event.user === ownBotId) return;
    const text = this.extractText(event);
    if (!text) return;
    const cfg = FastyclawServer.config.get().slack;
    if (!this.isAllowed(event.user, cfg)) return;
    if (!this.shouldRespond(kind, event, cfg)) return;

    const chanKind = this.chatKind(event);
    const meta: ChatMeta = { title: this.chatTitle(event), kind: chanKind };
    const threadId = await this.chats.resolve(event.channel, meta);
    const thread = await FastyclawServer.threads.load(threadId);
    if (!thread) return;
    const replyThreadTs = event.thread_ts ?? event.ts;
    await this.runTurn(
      client,
      event.channel,
      replyThreadTs,
      thread,
      this.speakerPrefixed(event, text, chanKind),
    );
  };

  private extractText(event: SlackIncomingEvent): string {
    const raw = (event.text ?? '').trim();
    return raw;
  }

  private isAllowed(userId: string | undefined, cfg: SlackConfig): boolean {
    if (cfg.allowedUserIds.length === 0) return true;
    if (!userId) return false;
    return cfg.allowedUserIds.includes(userId);
  }

  private shouldRespond(
    kind: SlackEventKind,
    event: SlackIncomingEvent,
    cfg: SlackConfig,
  ): boolean {
    if (kind === 'app_mention') return true;
    if (event.channel_type === 'im') return true;
    if (cfg.channelTrigger === 'all') return true;
    const text = (event.text ?? '').trim();
    if (text.startsWith('/ask')) return true;
    if (event.thread_ts && this.isOwnThread(event.channel, event.thread_ts)) return true;
    return false;
  }

  private chatKind(event: SlackIncomingEvent): SlackChannelKind {
    const t = event.channel_type;
    if (t === 'im') return 'im';
    if (t === 'mpim') return 'mpim';
    if (t === 'group') return 'group';
    if (event.channel.startsWith('D')) return 'im';
    if (event.channel.startsWith('G')) return 'group';
    return 'channel';
  }

  private chatTitle(event: SlackIncomingEvent): string {
    const kind = this.chatKind(event);
    if (kind === 'im') return event.user ?? event.channel;
    return event.channel;
  }

  private speakerPrefixed(
    event: SlackIncomingEvent,
    text: string,
    kind: SlackChannelKind,
  ): string {
    let body = this.stripBotMention(text);
    if (body.startsWith('/ask')) body = body.slice('/ask'.length).trim();
    if (!body) return '';
    if (kind === 'im') return body;
    const speaker = event.user ?? 'user';
    return `@${speaker}: ${body}`;
  }

  private stripBotMention(text: string): string {
    const id = this.botModule.botUserId();
    if (!id) return text.trim();
    return text.replaceAll(`<@${id}>`, '').trim();
  }

  private async runTurn(
    client: WebClient,
    channel: string,
    threadTs: string,
    thread: Thread,
    userText: string,
  ): Promise<void> {
    if (!userText) return;
    FastyclawServer.threads.activate(thread);
    const snapshotConfig: AppConfig = FastyclawServer.config.get();
    const stream = new SlackStream(client, channel, threadTs, (ts) =>
      this.rememberOwnTs(channel, ts),
    );
    try {
      await stream.init();
    } catch (err) {
      console.error(`[slack] failed to send placeholder: ${err instanceof Error ? err.message : String(err)}`);
      FastyclawServer.threads.deactivate(thread.id);
      return;
    }
    const abort = new AbortController();
    const run: Run = {
      threadId: thread.id,
      thread,
      config: snapshotConfig,
      abort,
      stream,
      close: () => {
        try { abort.abort(); } catch { /* ignore */ }
        stream.end();
        closeTerminal(thread.id);
        void closeBrowserSession(thread.id);
      },
    };

    try {
      await AgentRuntime.loop.run(run, userText, async (messages: UIMessage[]) => {
        thread.messages = messages;
        await FastyclawServer.threads.save(thread);
      });
    } finally {
      run.close();
      await stream.drain();
      FastyclawServer.threads.deactivate(thread.id);
    }
  }
}
