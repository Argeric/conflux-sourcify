import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export default {
  server: {
    port: parseInt(process.env.SERVER_PORT || "17651"),
    maxFileSize: parseInt(process.env.SERVER_MAX_FILE_SIZE || "31457280"), // 30 MB
    enableProfile: Boolean(process.env.SERVER_ENABLE_PROFILE) || false,
  },
  proxy: process.env.HTTP_PROXY,
  solc: {
    solcBinRepo: process.env.SOLC_REPO_BIN || "./solc-repo/bin",
    solcJsRepo: process.env.SOLC_REPO_JS || "./solc-repo/js",
  },
  vyper: {
    vyperRepo: process.env.VYPER_REPO || "./vyper-repo",
  },
  mysql: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: parseInt(process.env.MYSQL_PORT || "3306"),
    username: process.env.MYSQL_USERNAME || "root",
    password: process.env.MYSQL_PASSWORD || "root",
    database: process.env.MYSQL_DATABASE || "verification",
    dialect: "mysql",
    syncSchema: true,
    readonly: false,
    logging: false,
  },
  chains: {
    1: {
      name: "Conflux coreSpace testnet",
      supported: true,
      corespace: true,
      confluxscanApi: {
        apiURL: "https://api-testnet.confluxscan.org",
      },
      fetchContractCreationTxUsing: {
        confluxscanApi: true
      },
      rpc: [
        process.env.CHAIN_1_RPC_1 || "http://test.confluxrpc.com",
        process.env.CHAIN_1_RPC_2 || "http://test-internal.confluxrpc.com"
      ],
      traceSupportedRPCs: [
        {
          type: "trace_transaction",
          index: 1,
        },
      ],
      sync: {
        delayBlocksAgainstLatest: 3,
      },
      announcement: "cfxtest:aca514ancmbdu9u349u4m7d0u4jjdv83py3muarnv1",
    },
    71: {
      name: "Conflux eSpace testnet",
      supported: true,
      confluxscanApi: {
        apiURL: "https://evmapi-testnet.confluxscan.org",
      },
      fetchContractCreationTxUsing: {
        confluxscanApi: true
      },
      rpc: [
        process.env.CHAIN_71_RPC_1 || "http://evmtestnet.confluxrpc.com",
        process.env.CHAIN_71_RPC_2 || "http://evmtestnet-internal.confluxrpc.com"
      ],
      traceSupportedRPCs: [
        {
          type: "trace_transaction",
          index: 1,
        },
      ],
      sync: {
        delayBlocksAgainstLatest: 3,
      },
      announcement: "0x623a0340BD4b0817379C8482C92Dd26fb8C5316d",
    },
    1029: {
      name: "Conflux coreSpace mainnet",
      supported: true,
      corespace: true,
      confluxscanApi: {
        apiURL: "https://api-stage.confluxscan.org",
      },
      fetchContractCreationTxUsing: {
        confluxscanApi: true
      },
      rpc: [
        process.env.CHAIN_1029_RPC_1 || "http://main.confluxrpc.com",
        process.env.CHAIN_1029_RPC_2 || "http://main-internal.confluxrpc.com",
      ],
      traceSupportedRPCs: [
        {
          type: "trace_transaction",
          index: 1,
        },
      ],
      sync: {
        delayBlocksAgainstLatest: 3,
      },
      announcement: "cfx:aca514ancmbdu9u349u4m7d0u4jjdv83pyxbdunbz7",
    },
    1030: {
      name: "Conflux eSpace mainnet",
      supported: true,
      confluxscanApi: {
        apiURL: "https://evmapi.confluxscan.org",
      },
      fetchContractCreationTxUsing: {
        confluxscanApi: true
      },
      rpc: [
        process.env.CHAIN_1030_RPC_1 || "http://evm.confluxrpc.com",
        process.env.CHAIN_1030_RPC_2 || "http://evm-internal.confluxrpc.com"
      ],
      traceSupportedRPCs: [
        {
          type: "trace_transaction",
          index: 1,
        },
      ],
      sync: {
        delayBlocksAgainstLatest: 3,
      },
      announcement: "0xdf07c798e70138ca6963ea0db3226e124db59ddd",
    },
    16602: {
      name: "0G Galileo Testnet",
      supported: true,
      corespace: false,
      confluxscanApi: {
        apiURL: "https://chainscan-test.0g.ai/open",
      },
      rpc: ["http://evmrpc-testnet.0g.ai"],
    },
    16661: {
      name: "0G mainnet",
      supported: true,
      corespace: false,
      confluxscanApi: {
        apiURL: "https://chainscan.0g.ai/open",
      },
      rpc: ["http://evmrpc.0g.ai"],
    },
    17000: {
      name: "Ethereum Holesky Testnet",
      supported: true,
      corespace: false,
      confluxscanApi: {
        apiURL: "https://api-holesky.etherscan.io",
        apiKeyEnvName: "ETHERSCAN_API_KEY",
      },
      rpc: ["https://ethereum-holesky-rpc.publicnode.com"],
      traceSupportedRPCs: [
        {
          type: "trace_transaction",
          index: 0,
        },
      ],
    },
    560048: {
      name: "Ethereum Hoodi Testnet",
      supported: true,
      corespace: false,
      confluxscanApi: {
        apiURL: "https://api.etherscan.io/v2",
        apiKeyEnvName: "ETHERSCAN_API_KEY",
      },
      rpc: ["https://0xrpc.io/hoodi"],
      traceSupportedRPCs: [
        {
          type: "trace_transaction",
          index: 0,
        },
      ],
    },
    31337: {
      name: "Hardhat Network Localhost",
      supported: true,
      corespace: false,
      rpc: [`http://localhost:8545`],
    },
  },
  // chainHealth: {
  //   health: {
  //     threshold: 60 * 1000, // (ms) report unhealthy if threshold reached
  //     remind: 5 * 60 * 1000, // (ms) remind unhealthy if unrecovered for a long time
  //   },
  //   channels: ["dingrobot"], // Notification channels
  // },
  // alert: {
  //   customTags: ["uni-verif"],
  //   channels: {
  //     dingrobot: {
  //       type: "dingtalk", // The type of the channel. In this case, it's 'dingtalk'
  //       webhook: `https://oapi.dingtalk.com/robot/send?access_token=${process.env.DINGTALK_ACCESS_TOKEN}`, // The webhook URL for the DingTalk robot
  //       secret: process.env.DINGTALK_ACCESS_SECRET, // The secret key for the DingTalk robot
  //       msgType: "text", // Available message types are `text` and `markdown`
  //       atMobiles: [], // List of mobile numbers to be mentioned in the alert. If empty, no one is mentioned
  //       isAtAll: false // If set to true, all members are mentioned in the alert. If false, only the members in 'atMobiles' are mentioned
  //     },
  //     tgrobot: {
  //       type: "telegram", // The type of the channel. In this case, it's 'telegram'.
  //       apiToken: process.env.TELEGRAM_API_TOKEN, // # The API token for the Telegram robot.
  //       chatId: process.env.TELEGRAM_CHAT_ID, // # The chat ID for the Telegram chat where the alerts are sent.
  //       atUsers: [] //# List of public usernames in the chat to be mentioned.
  //     }
  //   }
  // },
  // log: {
  //   level: "info",
  //   alertHook: { // Alert hooking settings
  //     level: "error", // Hooked logrus level for alert notification
  //     channels: ["dingrobot"], // Notification channels
  //     async: false // Async options for sending alert
  //   }
  // },
};
