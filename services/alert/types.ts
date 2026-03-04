import {
  Notification
} from "./formatter/types";

export type ChannelType = "dingtalk" | "telegram";

export interface Channel {
  name(): string;

  type(): ChannelType;

  send(note: Notification): Promise<void>;
}

export const MSG_TYPE_MARKDOWN = "markdown";
export const MSG_TYPE_TEXT = "text";

export interface MarkdownMessage {
  msgtype: string;
  markdown: MarkdownParams;
  at?: AtParams;
}

export interface TextMessage {
  msgtype: string;
  text: TextParams;
  at?: AtParams;
}

export interface MarkdownParams {
  title: string;
  text: string;
}

export interface TextParams {
  content: string;
}

export interface AtParams {
  atMobiles?: string[];
  isAtAll?: boolean;
}

export interface DingResponse {
  errcode: number;
  errmsg: string;
}


export class MsgTypeNotSupportedError extends Error {
  constructor(msgType: string) {
    super(`message type ${msgType} not supported`);
    this.name = "MsgTypeNotSupportedError";
  }
}