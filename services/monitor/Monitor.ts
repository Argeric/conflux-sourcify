import dotenv from "dotenv";
import path from "path";
import { Chain } from "../chain/Chain";
import { ChainMap } from "../../server";
import { ChainMonitor } from "./ChainMonitor";
import { loadConfig } from "../../config/Loader";
import { Dao } from "../store/Dao";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

export class Monitor {
  private database: Dao;
  private chains: ChainMap;
  private readonly chainMonitors: ChainMonitor[];

  constructor() {
    const config = loadConfig();
    this.database = new Dao(config.mysql);
    this.chains = Object.fromEntries(
      Object.values(config.chains)
        .filter(chain => Boolean(chain.announcement))
        .map(chain => [chain.chainId, new Chain(chain)])
    );
    this.chainMonitors = Object.values(this.chains).map(chain => new ChainMonitor(chain));
  }

  /**
   * Starts the monitor on all the designated chains.
   */
  start = async (): Promise<void> => {
    await this.database.init();
    console.info("Starting Monitor for chains", {
      numberOfChains: this.chainMonitors.length,
      chains: this.chainMonitors.map((cm) => cm.chain.chainId)
    });
    const promises: Promise<void>[] = [];
    for (const cm of this.chainMonitors) {
      promises.push(cm.start());
    }
    await Promise.all(promises);
    console.info("All ChainMonitors started");
  };

  /**
   * Stops the monitor after executing all the pending requests.
   */
  stop = (): void => {
    this.chainMonitors.forEach((cm) => cm.stop());
    console.info("Monitor stopped");
  };
}

if (require.main === module) {
  const monitor = new Monitor();
  monitor
    .start()
    .then(() => {
      console.log("Monitor started successfully");
    })
    .catch((error) => {
      console.error("Failed to start monitor", error);
    });
}
