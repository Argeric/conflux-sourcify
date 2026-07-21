import { Interface, keccak256 } from "ethers";
import { Chain } from "../chain/Chain";
import { decodeAnnounce } from "../utils/contract-call-util";
import { getCreatorTx } from "../utils/contract-creation-util";
import { Tables } from "../store/Tables";
import KV = Tables.KV;
import { format } from "js-conflux-sdk";
import logger from "../log/logger";
import { TimedCounter } from "../health/timedCounter";
import { ConfigInstance } from "../../config/Loader";
import SignatureType = Tables.SignatureType;
import MaxSignature = Tables.MaxSignature;
import MaxFullFormat = Tables.MaxFullFormat;
import IAbiSignature = Tables.IAbiSignature;
import AbiSignature = Tables.AbiSignature;

export class BaseSyncer {
  TOPICS = [
    "0x14cb751d0950ff2788201931c45f715f7472443bc197311d9e3a7a0ba566b7e6"
  ];

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
    const health = ConfigInstance.chainHealth;
    this.health = new TimedCounter(health?.health);
    this.channels = health?.channels;
  }

  async loadLastSyncBlock() {
    const lastBlock = await KV.getNumber(this.KEY_SYNC_BLOCK_NUM);
    if (lastBlock !== null) {
      this.currentBlock = lastBlock + 1;
      return;
    }

    const txHash = await getCreatorTx(this.chain, this.chain.announcement!);
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
      await AbiSignature.bulkCreate(list, { updateOnDuplicate: ["full_format", "updatedAt"] });
      logger.info(`Stored abi ${len}, block ${fromBlock} ${endBlock}, chain ${this.chainId}`);
    }

    await KV.saveNumber(this.KEY_SYNC_BLOCK_NUM, endBlock);
  }

  private decode(logs: any[]): Tables.IAbiSignature[] {
    const announces = logs
      .map((log: any) => decodeAnnounce(log))
      .filter(Boolean);

    const list: Tables.IAbiSignature[] = [];
    for (const announce of announces) {
      if (format.hexAddress(announce.address) !== this.announcement) {
        continue;
      }

      if (Buffer.from(announce.key, "base64").toString() !== "contract/abi") {
        continue;
      }

      const value = Buffer.from(announce.value, "base64").toString();
      const sigs = BaseSyncer.parseABISignatures(value);
      list.push(...sigs);
    }

    return list;
  }

  static parseABISignatures(abiObj: any) {
    const abi = (typeof abiObj === "string") ? JSON.parse(abiObj) : abiObj;

    let iFace: Interface;
    try {
      iFace = new Interface(abi);
    } catch (e) {
      logger.info(`Failed to parse abi, abi ${abi}`, e);
      throw e;
    }

    const list = [];
    const fragments = [...Object.values(iFace.fragments)];

    for (const fragment of fragments) {
      const type = fragment.type;
      if (type !== SignatureType.Error && type !== SignatureType.Event && type !== SignatureType.Function) {
        continue;
      }

      const signature = fragment.format("sighash");
      const fullFormat = fragment.format("full");

      const abiSig = BaseSyncer.getSignature(type as SignatureType, signature, fullFormat);
      if (abiSig) {
        list.push(abiSig);
      }
    }

    return list;
  }

  static getSignature(type: SignatureType, signature: string, full_format: string): IAbiSignature | null {
    if (signature.length > MaxSignature) {
      logger.info(`Abi signature ${signature.length} exceeds max length ${MaxSignature}\n`, signature);
      return null;
    }
    if (full_format.length > MaxFullFormat) {
      logger.info(`Abi fullFormat ${full_format.length} exceeds max length ${MaxFullFormat}\n`, full_format);
      return null;
    }

    const hash = keccak256(Buffer.from(signature));
    const full_format_hash = keccak256(Buffer.from(full_format));

    return {
      type,
      full_format_hash,
      full_format,
      hash: type === SignatureType.Event ? hash : hash.substring(0, 10),
      signature
    };
  }

  get chainId() {
    return this.chain.chainId;
  }
}
