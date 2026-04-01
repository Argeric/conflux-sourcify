import { Chain } from "../chain/Chain";
import { BaseSyncer } from "./BaseSyncer";
import logger from "../log/logger";
import { alertError } from "../utils/alert";

export class CatchupSyncer extends BaseSyncer {
  private finalizedBlock!: number;

  constructor(chain: Chain) {
    super(chain);
    if (!this.channels?.length) {
      logger.warn("No channels configured in chainHealth config", { chain: this.chainId });
    }
  }

  async sync() {
    logger.info(`Catchup syncer starting to sync data, chain ${this.chainId}`);

    for (; ;) {
      const needProcess = await this.tryBlockRange();
      if (!needProcess) {
        logger.info(`Catchup syncer done, chain ${this.chainId}`);
        return;
      }

      try {
        await this.syncRange(this.currentBlock, this.finalizedBlock);
      } catch (err: any) {
        /*logger.error("Failed to catchup data", {
          chain: this.chainId,
          currentBlock: this.currentBlock,
          finalizedBlock: this.finalizedBlock,
          error: err.message
        });*/
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async tryBlockRange(): Promise<boolean> {
    for (let i = 0; ; i++) {
      try {
        await this.updateBlockRange();
      } catch (err) {
        /*logger.error("Failed to get block range", {
          chain: this.chainId,
          currentBlock: this.currentBlock,
          finalizedBlock: this.finalizedBlock,
          try: i,
          error: err
        });*/
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      return this.currentBlock <= this.finalizedBlock;
    }
  }

  async updateBlockRange() {
    await this.loadLastSyncBlock();

    let alertErr = null;
    const tag = this.chain.corespace ? "latest_finalized" : "finalized";

    try {
      this.finalizedBlock = await this.chain.getBlockByTag(tag);
    } catch (err: any) {
      alertErr = err;
      throw err;
    } finally {
      if (this.channels) {
        await alertError(`BlockchainRPCError (chain ${this.chainId})`, this.health, this.channels, alertErr);
      }
    }
  }

  async syncRange(rangeStart: number, rangeEnd: number) {
    let [start, end] = this.nextSyncRange(rangeStart, rangeEnd);

    for (; ;) {
      const result = await this.batchGetLogsBestEffort(start, end,
        [this.chain.announcement], this.TOPICS);
      end = result.end;

      await this.store(start, end, result.logs);

      if (end >= rangeEnd) {
        break;
      }

      [start, end] = this.nextSyncRange(end + 1, rangeEnd);
    }
  }

  nextSyncRange(curStart: number, rangeEnd: number): number[] {
    const start = curStart;
    let end = rangeEnd;

    const batchBlocks = this.chain?.syncOptions?.batchBlocksOnCatchup;
    if (batchBlocks && Number.isInteger(batchBlocks)) {
      end = start + batchBlocks - 1;
      if (end > rangeEnd) {
        end = rangeEnd;
      }
    }

    return [start, end];
  }

  async batchGetLogsBestEffort(
    bnFrom: number, bnTo: number, address: string[], topics: string[]
  ): Promise<BatchLogs> {
    const start = bnFrom;
    let end = bnTo;

    for (; ;) {
      let alertErr = null;
      try {
        const logs: any[] = await this.chain.getLogs(start, end, address, topics);
        return {
          start,
          end,
          logs
        };
      } catch (err: any) {
        const msg = `${err}`;
        if (
          msg.includes("larger than max_gap") || // conflux full node
          msg.includes("please narrow down your filter condition") || // conflux confura
          msg.includes("block range") || // bsc
          msg.includes("blocks distance") || // evmos
          msg.includes("returned more than") // kava
        ) {
          try {
            const [, suggestEnd] = this.findClosedInterval(msg);
            end = suggestEnd;
          } catch {
            end = start + Math.floor((end - start) / 2);
          }
          continue;
        }
        alertErr = err;
        throw err;
      } finally {
        if (this.channels) {
          await alertError(`BlockchainRPCError (chain ${this.chainId})`, this.health, this.channels, alertErr);
        }
      }
    }
  }

  findClosedInterval(str: string) {
    const reg = new RegExp(/\[(\d+),\s*(\d+)\]/);
    const matches = str.match(reg);

    if (!matches || matches.length < 3) {
      throw new Error("Failed to match by regExp");
    }

    const start = parseInt(matches[1], 10);
    if (isNaN(start) || start < 0) {
      throw new Error("Invalid start value");
    }

    const end = parseInt(matches[2], 10);
    if (isNaN(end) || end < 0) {
      throw new Error("Invalid end value");
    }

    return [start, end];
  }
}

interface BatchLogs {
  start: number;
  end: number;
  logs: any[];
}
