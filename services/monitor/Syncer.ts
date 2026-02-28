import { Chain } from "../chain/Chain";
import { BaseSyncer } from "./BaseSyncer";

export class Syncer extends BaseSyncer {
  running: boolean;
  private interval: number = 0;
  private readonly intervalAdjustStep: number = 500;
  private readonly intervalUpperLimit: number = 3000;
  private readonly intervalLowerLimit: number = 0;

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
        console.log(`Chain monitor closed, chain ${that.chainId}`);
        return;
      }

      try {
        const result = await that.syncOnce();
        if (result === "wait") {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          that.resetInterval();
        }
      } catch (err) {
        that.adaptInterval();
      }

      setTimeout(repeat, that.interval);
    }

    repeat().then();
  }

  async syncOnce(): Promise<SyncResult> {
    const tag = this.chain.corespace ? "latest_state" : "latest";
    const latestBlock = await this.chain.getBlockByTag(tag);
    const delayBlocks = this.chain?.syncOptions?.delayBlocksAgainstLatest || 0;
    if (this.currentBlock > latestBlock - delayBlocks) {
      return "wait";
    }

    const receipts: any[] = await this.chain.getBlockReceipts(this.currentBlock);

    const statusFilter = this.chain.corespace ?
      (receipt: any) => receipt.outcomeStatus === 0 :
      (receipt: any) => receipt.status === "0x1";

    const logs = receipts
      .filter(statusFilter)
      .flatMap(receipt => receipt.logs);

    await this.store(this.currentBlock, this.currentBlock, logs);

    if (this.currentBlock % 100 === 0) {
      console.log(`Chain monitor synced block ${this.currentBlock}, chain ${this.chainId}`);
    }

    this.currentBlock++;

    return "next";
  }

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
