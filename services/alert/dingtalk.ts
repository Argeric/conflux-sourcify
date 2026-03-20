import * as crypto from "crypto";
import {
  Channel, ChannelType,
  MSG_TYPE_MARKDOWN, MSG_TYPE_TEXT,
  TextMessage, MarkdownMessage, AtParams,
  DingResponse, MsgTypeNotSupportedError, ChannelConfig
} from "./types";
import {
  DingTalkMarkdownFormatter,
  Formatter,
  SimpleTextFormatter
} from "./formatter/formatter";
import {
  Notification
} from "./formatter/types";

export class DingTalkError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "DingTalkError";
  }
}

export interface DingTalkConfig extends ChannelConfig{
  webhook: string;         // webhook URL
  secret?: string;         // secret token
  atMobiles?: string[];    // mobiles for @ members
  isAtAll?: boolean;       // whether to @ all members
  msgType?: string;        // message type: `text` or `markdown`
}

export class DingTalkChannel implements Channel {
  private readonly id: string;
  private readonly formatter: Formatter;
  private readonly robot: Robot;
  private readonly config: DingTalkConfig;

  constructor(
    chId: string,
    fmt: Formatter,
    config: DingTalkConfig
  ) {
    if (!config.webhook) {
      throw new Error("DingTalk webhook is required");
    }

    this.id = chId;
    this.formatter = fmt;

    this.config = {
      type: config.type,
      webhook: config.webhook,
      secret: config.secret,
      atMobiles: config.atMobiles || [],
      isAtAll: config.isAtAll || false,
      msgType: config.msgType || MSG_TYPE_MARKDOWN
    };

    this.robot = new Robot(this.config.webhook, this.config.secret);
  }

  name(): string {
    return this.id;
  }

  type(): ChannelType {
    return "dingtalk";
  }

  async send(note: Notification): Promise<void> {
    try {
      const msg = this.formatter.format(note);

      await this.robot.send(
        this.config.msgType!,
        note.title,
        msg,
        this.config.atMobiles,
        this.config.isAtAll
      );
    } catch (error) {
      if (error instanceof DingTalkError) {
        throw error;
      }

      throw new DingTalkError("Failed to send ding msg", error as Error);
    }
  }
}

// dingtalk robot
export class Robot {

  constructor(
    private readonly webhook: string,
    private readonly secret?: string
  ) {
  }

  async send(
    msgType: string,
    title: string,
    text: string,
    atMobiles?: string[] | undefined,
    isAtAll?: boolean | undefined
  ): Promise<void> {
    switch (msgType) {
      case MSG_TYPE_TEXT:
        return this.sendText(text, atMobiles, isAtAll);
      case MSG_TYPE_MARKDOWN:
        return this.sendMarkdown(title, text, atMobiles, isAtAll);
      default:
        throw new MsgTypeNotSupportedError(msgType);
    }
  }

  async sendText(
    content: string,
    atMobiles?: string[],
    isAtAll?: boolean
  ): Promise<void> {
    const message: TextMessage = {
      msgtype: MSG_TYPE_TEXT,
      text: { content },
      at: this.buildAtParams(atMobiles, isAtAll)
    };
    return this.doSend(message);
  }

  async sendMarkdown(
    title: string,
    text: string,
    atMobiles?: string[],
    isAtAll?: boolean
  ): Promise<void> {
    const message: MarkdownMessage = {
      msgtype: MSG_TYPE_MARKDOWN,
      markdown: { title, text },
      at: this.buildAtParams(atMobiles, isAtAll)
    };
    return this.doSend(message);
  }

  private buildAtParams(atMobiles?: string[], isAtAll?: boolean): AtParams | undefined {
    if ((!atMobiles || atMobiles.length === 0) && !isAtAll) {
      return undefined;
    }

    return {
      ...(atMobiles?.length ? { atMobiles } : {}),
      ...(isAtAll ? { isAtAll } : {})
    };
  }

  private async doSend(message: TextMessage | MarkdownMessage) {
    try {
      const jsonMessage = JSON.stringify(message);

      let webURL = this.webhook;
      if (this.secret) {
        webURL += this.genSignedURL(this.secret);
      }

      const response = await fetch(webURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: jsonMessage
      });

      if (!response.ok) {
        throw new DingTalkError(`Failed to send ding message. HTTP status: ${response.status}`);
      }

      const data = await response.json() as DingResponse;

      if (data.errcode !== 0) {
        throw new DingTalkError(`Failed to send ding message. Err code: ${data.errmsg}`);
      }
    } catch (error) {
      if (error instanceof DingTalkError) {
        throw error;
      }
      throw new DingTalkError("Failed to send ding message", error as Error);
    }
  }

  private genSignedURL(secret: string): string {
    const timestamp = Date.now();
    const signStr = `${timestamp}\n${secret}`;
    const sign = this.computeHmacSha256(signStr, secret);
    const encodedSign = encodeURIComponent(sign);
    return `&timestamp=${timestamp}&sign=${encodedSign}`;
  }

  private computeHmacSha256(message: string, secret: string): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(message);
    return hmac.digest("base64");
  }
}

// tools
export function createDingtalkMsgFormatter(
  msgType: string,
  tags: string[],
  mentions?: string[]
): Formatter {
  const normalizedMsgType = msgType.toLowerCase();
  if (normalizedMsgType === MSG_TYPE_TEXT) {
    return new SimpleTextFormatter(tags, mentions || []);
  } else if (normalizedMsgType === MSG_TYPE_MARKDOWN) {
    return new DingTalkMarkdownFormatter(tags, mentions || []);
  } else {
    throw new MsgTypeNotSupportedError(msgType);
  }
}