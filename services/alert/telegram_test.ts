import { createTelegramMsgFormatter, TelegramChannel } from "./telegram";
import { Notification, Severity, severityToString } from "./formatter/types";
import { MsgTypeNotSupportedError } from "./types";
import { enableHttpProxy } from "../utils/util";
import TelegramBot from "node-telegram-bot-api";

enableHttpProxy("http://127.0.0.1:7890");

async function example() {
  const formatter = createTelegramMsgFormatter(
    "markdown",
    ["tag1", "tag2"],
    ["user1", "user2"]
  );

  const channel = new TelegramChannel(
    "telegram-1",
    formatter,
    {
      apiToken: "8615238281:AAFvt7k1n78G77bR2wANzzH1NGLAhN6SqK8",
      chatId: "5533464152",
      atUsers: ["user1", "user2"]
    }
  );

  // simple text type
  const notification: Notification = {
    title: 'test-alert',
    content: 'test-xxx',
    severity: Severity.High
  };

  /*const logItem = {
    level: severityToString(Severity.High),
    message: "test message xxx",
    timestamp: new Date().toISOString(),
    service: "srv-name",
    error: new MsgTypeNotSupportedError("mst"),
    ctxFields: {
      field1: 123,
      field2: "abc",
      field3: true
    }
  };

  // markdown type
  const notification: Notification = {
    title: "test-alert",
    content: logItem,
    severity: Severity.High
  };*/

  try {
    await channel.send(notification);
    console.log("Succeed to send");
  } catch (error) {
    console.error("Failed to send:", error);
  }
}

async function send() {
  const bot = new TelegramBot("8615238281:AAFvt7k1n78G77bR2wANzzH1NGLAhN6SqK8");
  const groupChatId = '5533464152';
  await bot.sendMessage(groupChatId, '这是一条群组消息，所有群成员都能看到');
}

example().then();