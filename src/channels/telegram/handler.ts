import type { Context } from 'grammy';
import type { UIMessage } from 'ai';
import { AgentRuntime } from '@/agent/index';
import { FastyclawServer } from '@/server/index';
import type { AppConfig, Run, Thread, TelegramConfig } from '@/server/types';
import { closeTerminal } from '@/agent/sessions/terminal';
import { closeBrowserSession } from '@/agent/sessions/browser';
import { TelegramStream } from '@/channels/telegram/stream';
import type { SubmoduleFastyclawTelegramBot } from '@/channels/telegram/bot';
import type { SubmoduleFastyclawTelegramChats } from '@/channels/telegram/chats';
import type { ChatKind, ChatMeta } from '@/channels/telegram/types';

export class SubmoduleFastyclawTelegramHandler {
  public constructor(
    private readonly botModule: SubmoduleFastyclawTelegramBot,
    private readonly chats: SubmoduleFastyclawTelegramChats,
  ) {}

  public handle = async (ctx: Context): Promise<void> => {
    if (!ctx.chat || !ctx.from || !ctx.message?.text) return;
    const config = FastyclawServer.config.get().telegram;
    if (!this.isAllowed(ctx.from.id, config)) return;
    if (!this.shouldRespond(ctx, config)) return;

    const meta: ChatMeta = {
      title: this.chatTitle(ctx),
      kind: ctx.chat.type as ChatKind,
    };
    const threadId = await this.chats.resolve(ctx.chat.id, meta);
    const thread = await FastyclawServer.threads.load(threadId);
    if (!thread) return;
    const text = this.extractUserText(ctx);
    if (!text) return;

    await this.runTurn(ctx.chat.id, thread, text);
  };

  private isAllowed(userId: number | undefined, config: TelegramConfig): boolean {
    if (userId === undefined) return false;
    if (config.allowedUserIds.length === 0) return true;
    return config.allowedUserIds.includes(userId);
  }

  private shouldRespond(ctx: Context, config: TelegramConfig): boolean {
    const chatType = ctx.chat?.type;
    if (chatType === 'private') return true;
    if (chatType !== 'group' && chatType !== 'supergroup') return false;
    if (config.groupTrigger === 'all') return true;
    const text = ctx.message?.text ?? '';
    if (text.startsWith('/ask')) return true;
    const botUsername = this.botModule.username();
    if (botUsername && text.includes(`@${botUsername}`)) return true;
    const replyFromId = ctx.message?.reply_to_message?.from?.id;
    const botId = this.botModule.current()?.botInfo?.id;
    if (replyFromId !== undefined && botId !== undefined && replyFromId === botId) return true;
    return false;
  }

  private chatTitle(ctx: Context): string {
    const chat = ctx.chat!;
    if (chat.type === 'private') {
      const first = chat.first_name ?? '';
      const last = chat.last_name ?? '';
      const name = `${first} ${last}`.trim();
      return name || chat.username || String(chat.id);
    }
    return chat.title || String(chat.id);
  }

  private extractUserText(ctx: Context): string {
    let text = ctx.message?.text ?? '';
    const botUsername = this.botModule.username();
    if (botUsername) text = text.replaceAll(`@${botUsername}`, '').trim();
    if (text.startsWith('/ask')) text = text.slice('/ask'.length).trim();
    if (!text) return '';
    const chatType = ctx.chat?.type;
    if (chatType === 'group' || chatType === 'supergroup') {
      const speaker = ctx.from?.username
        ?? [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ').trim()
        ?? String(ctx.from?.id ?? 'user');
      return `@${speaker}: ${text}`;
    }
    return text;
  }

  private async runTurn(chatId: number, thread: Thread, userText: string): Promise<void> {
    const bot = this.botModule.current();
    if (!bot) return;
    FastyclawServer.threads.activate(thread);
    const snapshotConfig: AppConfig = FastyclawServer.config.get();
    const stream = new TelegramStream(bot, chatId);
    try {
      await stream.init();
    } catch (err) {
      console.error(`[telegram] failed to send placeholder: ${err instanceof Error ? err.message : String(err)}`);
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
