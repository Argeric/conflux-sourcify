import logger from "../log/logger";

export async function heapDump(fullFilePath: string, delay = 5 * 60 * 1000) {
  const heapdump = await import("heapdump");
  logger.info(`schedule heap dump, interval: ${delay}`);
  const dest = `${fullFilePath}.heapsnapshot`;

  setTimeout(() => {
    heapdump.writeSnapshot(dest);
    logger.info(`heap dump writen to ${dest}`);
  }, delay);
}
