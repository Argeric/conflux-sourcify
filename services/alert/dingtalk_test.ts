import { DingTalkChannel, createDingtalkMsgFormatter } from "./dingtalk";
import { Notification, Severity, severityToString } from "./formatter/types";
import { MsgTypeNotSupportedError } from "./types";
import { AlertContent } from "../utils/alert";

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

  // log item
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

  // alert content
  const errMsg = "None of the RPCs responded fetching blockNumber from chain 71. [{\"url\":\"http://evmtestnet.confluxrpc.com\",\"error\":\"could not coalesce error (error={ &quot;code&quot;: -32005, &quot;message&quot;: &quot;daily request count exceeded: Too many requests (exceeds 100000), try again after 19m58.835s; see https://doc.confluxnetwork.org/docs/espace/network-endpoints#common-errors for more details&quot; }, payload={ &quot;id&quot;: 48308, &quot;jsonrpc&quot;: &quot;2.0&quot;, &quot;method&quot;: &quot;eth_getBlockByNumber&quot;, &quot;params&quot;: [ &quot;finalized&quot;, false ] }, code=UNKNOWN_ERROR, version=6.13.7)\"},{\"url\":\"http://evmtestnet-internal.confluxrpc.com\",\"error\":\"server response 503 Service Temporarily Unavailable (request={  }, response={  }, error=null, info={ &quot;requestUrl&quot;: &quot;http://evmtestnet-internal.confluxrpc.com&quot;, &quot;responseBody&quot;: &quot;<html>\\r\\n<head><title>503 Service Temporarily Unavailable</title></head>\\r\\n<body>\\r\\n<center><h1>503 Service Temporarily Unavailable</h1></center>\\r\\n<hr><center>openresty</center>\\r\\n</body>\\r\\n</html>\\r\\n&quot;, &quot;responseStatus&quot;: &quot;503 Service Temporarily Unavailable&quot; }, code=SERVER_ERROR, version=6.13.7)\"}]";
  const err = new Error(errMsg);
  const elapsed = 1000000;
  const url = "";
  const alertContent= new AlertContent(err.message, elapsed, url)

  const notification: Notification = {
    title: "test-alert",
    content: alertContent.toString(),
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
