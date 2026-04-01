import { Chain } from "../chain/Chain";
import { BaseSyncer } from "./BaseSyncer";
import logger from "../log/logger";
import { alertError } from "../utils/alert";

export class Syncer extends BaseSyncer {
  running: boolean;
  private interval: number = 0;
  private readonly intervalAdjustStep: number = 100;
  private readonly intervalUpperLimit: number = 3000;
  private readonly intervalLowerLimit: number = 100;
  private latestBlock!: number;
  private checkReceiptsAPIAlready: boolean = false;
  private syncDataByLogs: boolean = false;

  constructor(chain: Chain) {
    super(chain);
    this.running = true;
  }

  public async sync() {
    await this.loadLastSyncBlock();

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    async function repeat() {
      if (!that.running) {
        logger.info(`Chain monitor closed, chain ${that.chainId}`);
        return;
      }

      try {
        const result = await that.syncOnce();
        if (result === "wait") {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          that.resetInterval();
        }
      } catch (err: any) {
        that.adaptInterval();
        /*logger.error("Failed to sync data", {
          currentBlock: that.currentBlock,
          chain: that.chainId,
          interval: that.interval,
          error: err.message
        });*/
      }

      setTimeout(repeat, that.interval);
    }

    repeat().then();
  }

  async syncOnce(): Promise<SyncResult> {
    let latestBlock;
    let alertErr = null;
    const tag = this.chain.corespace ? "latest_state" : "latest";

    try {
      latestBlock = await this.chain.getBlockByTag(tag);
      alertErr = (this.latestBlock && latestBlock <= this.latestBlock) ?
        new Error(`Blockchain stuck at ${latestBlock}`) :
        null;
    } catch (err: any) {
      alertErr = err;
      throw err;
    } finally {
      if (this.channels) {
        await alertError(`BlockchainRPCError (chain ${this.chainId})`, this.health, this.channels, alertErr);
      }
    }
    this.latestBlock = latestBlock;

    const delayBlocks = this.chain?.syncOptions?.delayBlocksAgainstLatest || 0;
    if (this.currentBlock > latestBlock - delayBlocks) {
      return "wait";
    }

    await this.tryReceiptsRPC();

    let logs;
    if (this.syncDataByLogs) {
      logs = await this.chain.getLogs(this.currentBlock, this.currentBlock, [this.chain.announcement], this.TOPICS);
    } else {
      const receipts: any[] = await this.chain.getBlockReceipts(this.currentBlock);
      const statusFilter = this.chain.corespace ?
        (receipt: any) => receipt.outcomeStatus === 0 :
        (receipt: any) => receipt.status === "0x1";
      logs = receipts.filter(statusFilter).flatMap(receipt => receipt.logs);
    }

    await this.store(this.currentBlock, this.currentBlock, logs);

    if (this.currentBlock % 100 === 0) {
      logger.info(`Chain monitor synced block ${this.currentBlock}, chain ${this.chainId}`);
    }

    this.currentBlock++;

    return "next";
  }

  private tryReceiptsRPC = async (times: number = 3) => {
    if (!this.checkReceiptsAPIAlready) {
      for (let i = 0; i < times; i++) {
        try {
          await this.chain.getBlockReceipts(this.currentBlock);
        } catch (err: any) {
          if (`${err}`.includes("None of the RPCs responded")) {
            this.syncDataByLogs = true;
            break;
          } else {
            throw err;
          }
        }
      }
      this.checkReceiptsAPIAlready = true;
    }
  };

  private adaptInterval = (increase: boolean = true) => {
    this.interval += (increase ? 1 : -1) * this.intervalAdjustStep;
    this.interval = Math.min(this.interval, this.intervalUpperLimit);
    this.interval = Math.max(this.interval, this.intervalLowerLimit);
  };

  private resetInterval = () => {
    this.interval = 0;
  };

  public stop() {
    this.running = false;
  }
}

export type SyncResult = "wait" | "next";
