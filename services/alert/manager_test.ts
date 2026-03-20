import { loadConfig } from "../../config/Loader";
import { defaultManager, initAlertMgrFromConfig } from "./manager";
import { Notification, Severity, severityToString } from "./formatter/types";
import { strict as assert } from 'node:assert';
import { MsgTypeNotSupportedError } from "./types";

const config = loadConfig();
const alert = config.alert;
initAlertMgrFromConfig(alert);

const dingbot = defaultManager().channel("dingrobot");
assert.ok(dingbot !== undefined, "dingbot should not undefined!");

const dingbotNotExist = defaultManager().channel("dingrobot_not_exist");
assert.ok(dingbotNotExist === undefined, "dingbot should undefined!");

const textMsg: Notification = {
  title: 'test-alert',
  content: 'test-xxx',
  severity: Severity.High
};
dingbot.send(textMsg).then();

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
const markdownMsg: Notification = {
  title: "test-alert",
  content: logItem,
  severity: Severity.High
};
dingbot.send(markdownMsg).then();