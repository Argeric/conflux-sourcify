import { createTelegramMsgFormatter, TelegramChannel } from "./telegram";
import { Notification, Severity, severityToString } from "./formatter/types";
import { MsgTypeNotSupportedError } from "./types";
import { enableHttpProxy } from "../utils/util";

enableHttpProxy("http://127.0.0.1:7890");

async function example() {
  const formatter = createTelegramMsgFormatter(
    "markdown",
    ["tag1", "tag2"],
    ["mention1", "mention2"]
  );

  const channel = new TelegramChannel(
    "telegram-1",
    formatter,
    {
      type: 'telegram',
      apiToken: "xxx",
      chatId: "xxx",
      atUsers: ["user1", "user2"]
    }
  );

  /*// simple text type
  const notification: Notification = {
    title: 'test-alert',
    content: 'test-xxx',
    severity: Severity.High
  };*/

  const logItem = {
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
  };

  try {
    await channel.send(notification);
    console.info("Succeed to send");
  } catch (error) {
    console.error("Failed to send:", error);
  }
}

example().then();