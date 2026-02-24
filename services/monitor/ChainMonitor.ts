import { Chain } from "../chain/Chain";
import { CatchupSyncer } from "./CatchupSyncer";
import { Syncer } from "./Syncer";

export class ChainMonitor {
  chain: Chain;
  catchupSyncer: CatchupSyncer;
  syncer: Syncer;

  constructor(chain: Chain) {
    this.chain = chain;
    this.catchupSyncer = new CatchupSyncer(chain);
    this.syncer = new Syncer(chain);
  }

  async start() {
    await this.catchupSyncer.sync();
    this.syncer.sync().then();
  }

  stop() {
    this.syncer.stop();
  }
}
