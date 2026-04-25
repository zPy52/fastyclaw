import { ChannelType, type Message, type TextBasedChannel } from 'discord.js';
import type { UIMessage } from 'ai';
import { AgentRuntime } from '@/agent/index';
import { FastyclawServer } from '@/server/index';
import type { AppConfig, DiscordConfig, Run, Thread } from '@/server/types';
import { closeTerminal } from '@/agent/sessions/terminal';
import { closeBrowserSession } from '@/agent/sessions/browser';
import { DiscordStream } from '@/channels/discord/stream';
import type { SubmoduleFastyclawDiscordClient } from '@/channels/discord/client';
import type { SubmoduleFastyclawDiscordChats } from '@/channels/discord/chats';
import type { ChatMeta, DiscordChatKind } from '@/channels/discord/types';

export class SubmoduleFastyclawDiscordHandler {
  public constructor(
    private readonly clientModule: SubmoduleFastyclawDiscordClient,
    private readonly chats: SubmoduleFastyclawDiscordChats,
  ) {}

  public handle = async (m: Message): Promise<void> => {
    if (m.author.bot) return;
    if (m.system) return;
    const text = (m.content ?? '').trim();
    if (!text) return;
    const cfg = FastyclawServer.config.get().discord;
    if (!this.isAllowed(m.author.id, cfg)) return;
    if (!(await this.shouldRespond(m, text, cfg))) return;

    const kind = this.chatKind(m);
    const meta: ChatMeta = { title: this.chatTitle(m, kind), kind };
    const threadId = await this.chats.resolve(m.channelId, meta);
    const thread = await FastyclawServer.threads.load(threadId);
    if (!thread) return;
    const userText = this.speakerPrefixed(m, text, kind);
    if (!userText) return;
    await this.runTurn(m.channel as TextBasedChannel, thread, userText);
  };

  private isAllowed(userId: string, cfg: DiscordConfig): boolean {
    if (cfg.allowedUserIds.length === 0) return true;
    return cfg.allowedUserIds.includes(userId);
  }

  private async shouldRespond(m: Message, text: string, cfg: DiscordConfig): Promise<boolean> {
    if (m.channel.type === ChannelType.DM) return true;
    if (cfg.groupTrigger === 'all') return true;
    if (text.startsWith('/ask')) return true;
    const botId = this.clientModule.botUser()?.id;
    if (botId && m.mentions.users.has(botId)) return true;
    const refId = m.reference?.messageId;
    if (refId) {
      try {
        const replied = await m.channel.messages.fetch(refId);
        if (replied.author?.id === botId) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  private chatKind(m: Message): DiscordChatKind {
    const t = m.channel.type;
    if (t === ChannelType.DM) return 'dm';
    if (t === ChannelType.PublicThread || t === ChannelType.PrivateThread || t === ChannelType.AnnouncementThread) {
      return 'thread';
    }
    return 'guild';
  }

  private chatTitle(m: Message, kind: DiscordChatKind): string {
    if (kind === 'dm') return m.author.username || m.author.id;
    const ch = m.channel as unknown as { name?: string };
    return ch.name || m.channelId;
  }

  private speakerPrefixed(m: Message, text: string, kind: DiscordChatKind): string {
    let body = this.stripBotMention(text).trim();
    if (body.startsWith('/ask')) body = body.slice('/ask'.length).trim();
    if (!body) return '';
    if (kind === 'dm') return body;
    return `@${m.author.username}: ${body}`;
  }

  private stripBotMention(text: string): string {
    const id = this.clientModule.botUser()?.id;
    if (!id) return text;
    return text.replaceAll(`<@${id}>`, '').replaceAll(`<@!${id}>`, '').trim();
  }

  private async runTurn(channel: TextBasedChannel, thread: Thread, userText: string): Promise<void> {
    FastyclawServer.threads.activate(thread);
    const snapshotConfig: AppConfig = FastyclawServer.config.get();
    const stream = new DiscordStream(channel);
    try {
      await stream.init();
    } catch (err) {
      console.error(`[discord] failed to send placeholder: ${err instanceof Error ? err.message : String(err)}`);
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
