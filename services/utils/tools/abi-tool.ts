import { Dao } from "../../store/Dao";
import { Config, loadConfig } from "../../../config/Loader";
import { Tables } from "../../store/Tables";
import AbiSignature = Tables.AbiSignature;

/**
 * init
 */
export let config: Config;
export let database: Dao;

export async function init() {
  config = loadConfig();
  database = new Dao(config.mysql);
  await database.init();
}

export async function close() {
  await database.pool.close();
}

/**
 * params
 */
const args = process.argv.slice(2);
const type = Number(args[0]);
let funcId: string;
if (type === 1) {
  funcId = args[1];
}

async function run() {
  await init();
  if (type === 1) {
    await findAbiByFuncId(funcId);
  }
  await close();
}

/**
 * run
 */
run().then();

/**
 * biz
 */
async function findAbiByFuncId(funcId: string) {
  const abis = await AbiSignature.findAll({ where: { hash: funcId }, raw: true });
  console.log(`abis ==\n`, abis);
}
