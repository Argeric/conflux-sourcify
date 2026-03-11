import { Interface } from "ethers";
import { Chain } from "../chain/Chain";
import { decodeAnnounce } from "../utils/contract-call-util";
import { getCreatorTx } from "../utils/contract-creation-util";
import { Tables } from "../store/Tables";
import KV = Tables.KV;
import AbiInfo = Tables.AbiInfo;
import { format } from "js-conflux-sdk";
import logger from "../log/logger";
import { TimedCounter } from "../health/timedCounter";
import { ConfigInstance } from "../../config/Loader";

export class BaseSyncer {
  TOPICS = [
    "0x14cb751d0950ff2788201931c45f715f7472443bc197311d9e3a7a0ba566b7e6"
  ];
  MAX_LEN_EVENT_FULL_FORMAT = Tables.MAX_LEN_EVENT_SIG * 4;

  protected chain: Chain;
  protected currentBlock!: number;
  protected readonly KEY_SYNC_BLOCK_NUM: string;
  protected readonly announcement: string;
  protected health: TimedCounter;
  protected channels: string[];

  constructor(chain: Chain) {
    this.chain = chain;
    this.KEY_SYNC_BLOCK_NUM = `${Tables.KEY_SYNC_BLOCK_NUM}_${chain.chainId}`;
    this.announcement = format.hexAddress(chain.announcement);
    this.health = new TimedCounter(ConfigInstance.chainHealth.health);
    this.channels = ConfigInstance.chainHealth.channels;
  }

  async loadLastSyncBlock() {
    const lastBlock = await KV.getNumber(this.KEY_SYNC_BLOCK_NUM);
    if (lastBlock !== null) {
      this.currentBlock = lastBlock + 1;
      return;
    }

    const txHash = await getCreatorTx(this.chain, this.chain.announcement);
    if (!txHash) {
      throw new Error("Could not get creator tx for announcement.");
    }

    const tx = await this.chain.getTx(txHash);
    if (!tx.blockNumber) {
      throw new Error("Could not get block number for announcement.");
    }

    this.currentBlock = tx.blockNumber;
  }

  async store(fromBlock: number, endBlock: number, logs: any[]) {
    const list = this.decode(logs);

    const len = list.length;
    if (len) {
      await AbiInfo.bulkCreate(list, { updateOnDuplicate: ["full_format", "updatedAt"] });
      logger.info(`Stored abi ${len}, block ${fromBlock} ${endBlock}, chain ${this.chainId}`);
    }

    await KV.saveNumber(this.KEY_SYNC_BLOCK_NUM, endBlock);
  }

  private decode(logs: any[]): Tables.IAbiInfo[] {
    const announces = logs
      .map((log: any) => decodeAnnounce(log))
      .filter(Boolean);

    const list: Tables.IAbiInfo[] = [];
    for (const announce of announces) {
      if (format.hexAddress(announce.address) !== this.announcement) {
        continue;
      }

      if (Buffer.from(announce.key, "base64").toString() !== "contract/abi") {
        continue;
      }

      const value = Buffer.from(announce.value, "base64").toString();
      const abiArr = JSON.parse(value);
      const iFace = new Interface(abiArr);

      iFace.forEachFunction(func => {
        const signature = func.format("sighash");
        const full_format = func.format("full");
        if (signature.length > Tables.MAX_LEN_EVENT_SIG ||
          full_format.length > this.MAX_LEN_EVENT_FULL_FORMAT) {
          return;
        }
        list.push({ hash: func.selector, signature, full_format });
      });
    }

    return list;
  }

  get chainId() {
    return this.chain.chainId;
  }
}
