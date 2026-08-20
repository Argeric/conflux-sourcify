import { Dao } from "../../store/Dao";
import { Config, loadConfig } from "../../../config/Loader";
import { Tables } from "../../store/Tables";
import AbiSignature = Tables.AbiSignature;
import { ChainMap } from "../../../server";
import { Chain } from "../../chain/Chain";

/**
 * init
 */
export let config: Config;
export let database: Dao;
export let chainMap: ChainMap;

export async function init() {
  config = loadConfig();

  database = new Dao(config.mysql);
  await database.init();

  chainMap = {};
  for (const chainObj of Object.values(config.chains)) {
    chainMap[chainObj.chainId.toString()] = new Chain(chainObj);
  }
}

export async function close() {
  await database.pool.close();
}

async function run() {
  await init();

  const args = process.argv.slice(2);
  const type = Number(args[0]);

  if (type == 1) {
    const funcId = args[1];
    await findAbiByFuncId(funcId);
  }

  await close();
}

/**
 * biz
 */
async function findAbiByFuncId(funcId: string) {
  const abis = await AbiSignature.findAll({ where: { hash: funcId }, raw: true });
  console.log(`abis ==\n`, abis);
}

if (require.main === module) {
  run().then();
}
