import dotenv from "dotenv";
import path from "path";
import { Chain } from "../chain/Chain";
import { ChainMap } from "../../server";
import { ChainMonitor } from "./ChainMonitor";
import { ConfigInstance, loadConfig } from "../../config/Loader";
import { Dao } from "../store/Dao";
import logger from "../log/logger";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

export class Monitor {
  private database: Dao;
  private chains: ChainMap;
  private readonly chainMonitors: ChainMonitor[];

  constructor() {
    loadConfig();
    this.database = new Dao(ConfigInstance.mysql);
    this.chains = Object.fromEntries(
      Object.values(ConfigInstance.chains)
        .filter(chain => Boolean(chain.announcement))
        .map(chain => [chain.chainId, new Chain(chain)])
    );
    this.chainMonitors = Object.values(this.chains).map(chain => new ChainMonitor(chain));

    const handleShutdownSignal = async () => {
      await this.shutdown();
      process.exit(0);
    };
    process.on("SIGTERM", handleShutdownSignal);
    process.on("SIGINT", handleShutdownSignal);
  }

  /**
   * Starts the monitor on all the designated chains.
   */
  start = async (): Promise<void> => {
    await this.database.init();
    logger.info("Starting monitor for chains...", {
      numberOfChains: this.chainMonitors.length,
      chains: this.chainMonitors.map((cm) => cm.chain.chainId)
    });
    for (const cm of this.chainMonitors) {
      cm.start().then();
    }
  };


  /**
   * Stops the monitor after executing all the pending requests.
   */
  shutdown = async (): Promise<void> => {
    logger.info("Shutting down monitor...");
    this.chainMonitors.forEach((cm) => cm.stop());
    logger.info("Succeed to stop monitor");
  };
}

if (require.main === module) {
  new Monitor()
    .start()
    .then(() => {
      logger.info("Succeed to start monitor");
    })
    .catch((error) => {
      logger.warn("Failed to start monitor", error);
    });
}
