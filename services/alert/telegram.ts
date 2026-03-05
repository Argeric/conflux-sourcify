import { Formatter } from "./formatter/formatter";
import { Notification } from "./formatter/types";
import TelegramBot from "node-telegram-bot-api";
import { SimpleTextFormatter, TelegramMarkdownFormatter } from "./formatter/formatter";
import { ChannelConfig, ChannelType, MSG_TYPE_MARKDOWN, MSG_TYPE_TEXT, MsgTypeNotSupportedError } from "./types";

export class TelegramError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "TelegramError";
  }
}

export interface TelegramConfig extends ChannelConfig{
  apiToken: string;      // Api token
  chatId: string;        // Chat ID
  atUsers?: string[];    // Mention users
}

export class TelegramChannel {
  private readonly id: string;
  private readonly formatter: Formatter;
  private bot: TelegramBot;
  private readonly config: TelegramConfig;

  constructor(
    chId: string,
    fmt: Formatter,
    config: TelegramConfig
  ) {
    if (!config.apiToken) {
      throw new Error("Telegram API token is required");
    }
    if (!config.chatId) {
      throw new Error("Telegram chat ID is required");
    }

    this.id = chId;
    this.formatter = fmt;

    this.config = {
      type: config.type,
      apiToken: config.apiToken,
      chatId: config.chatId,
      atUsers: config.atUsers || []
    };

    this.bot = new TelegramBot(this.config.apiToken, {
      polling: false  // disable polling, only used for sending messages.
    });
  }

  name(): string {
    return this.id;
  }

  type(): ChannelType {
    return "telegram";
  }

  async send(note: Notification): Promise<void> {
    try {
      let msg = this.formatter.format(note);

      // add mentioned users
      if (this.config.atUsers && this.config.atUsers.length > 0) {

        const mentions = this.config.atUsers
          .map(user => `[@${user}](tg://user?id=${user})`)
          .join(" ");
        msg = `${msg}\n\n${mentions}`;
      }

      await this.bot.sendMessage(this.config.chatId, msg, {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true
      });

    } catch (error) {
      if (error instanceof TelegramError) {
        throw error;
      }

      throw new TelegramError("failed to send telegram message", error as Error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const me = await this.getBotInfo();
      return !!me;
    } catch {
      return false;
    }
  }

  async getBotInfo(): Promise<TelegramBot.User> {
    return this.bot.getMe();
  }
}

export function createTelegramMsgFormatter(
  msgType: string,
  tags: string[],
  mentions: string[]
): Formatter {
  const normalizedMsgType = msgType.toLowerCase();
  if (normalizedMsgType === MSG_TYPE_TEXT) {
    return new SimpleTextFormatter(tags, mentions);
  } else if (normalizedMsgType === MSG_TYPE_MARKDOWN) {
    return new TelegramMarkdownFormatter(tags, mentions);
  } else {
    throw new MsgTypeNotSupportedError(msgType);
  }
}