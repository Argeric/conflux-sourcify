import { DingTalkChannel, createDingtalkMsgFormatter } from "./dingtalk";
import { Notification, Severity, severityToString } from "./formatter/types";
import { MsgTypeNotSupportedError } from "./types";

async function example() {
  const formatter = createDingtalkMsgFormatter(
    "markdown",
    ["tag1", "tag2"],
    ["lilei"]
  );

  const channel = new DingTalkChannel(
    "dingtalk-1",
    formatter,
    {
      type: "dingtalk",
      webhook: "https://oapi.dingtalk.com/robot/send?access_token=xxx",
      secret: "xxx",
      msgType: "markdown",
      atMobiles: ["13800138000"],
      isAtAll: false
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
    console.log("Succeed to send");
  } catch (error) {
    console.error("Failed to send:", error);
  }
}

example().then();
