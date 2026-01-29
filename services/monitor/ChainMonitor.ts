import { Interface } from "ethers";
import { Chain } from "../chain/Chain";
import { decodeAnnounce } from "../utils/contract-call-util";
import { getCreatorTx } from "../utils/contract-creation-util";
import { Tables } from "../store/Tables";
import KV = Tables.KV;
import AbiInfo = Tables.AbiInfo;
import { format } from "js-conflux-sdk";

export class ChainMonitor {
  chain: Chain;
  private curBlock!: number;
  private running: boolean;
  private readonly KEY_SYNC_BLOCK_NUM: string;
  private readonly announcement: string;

  private interval: number = 0;
  private readonly intervalAdjustStep: number = 500;
  private readonly intervalUpperLimit: number = 3000;
  private readonly intervalLowerLimit: number = 0;

  constructor(chain: Chain) {
    this.chain = chain;
    this.running = true;
    this.KEY_SYNC_BLOCK_NUM = `${Tables.KEY_SYNC_BLOCK_NUM}_${chain.chainId}`;
    this.announcement = format.hexAddress(chain.announcement);
  }

  async loadLastSyncBlock() {
    const lastBlock = await KV.getNumber(this.KEY_SYNC_BLOCK_NUM, -1);
    if (lastBlock !== -1) {
      this.curBlock = lastBlock + 1;
      return;
    }

    const txHash = await getCreatorTx(this.chain, this.chain.announcement);
    if (!txHash) {
      throw new Error("Could not get creator tx for announcement.");
    }

    const tx = await this.chain.getTx(txHash);
    if (!tx.blockNumber) {
      throw new Error("Could not get block number for announcement.");
    }

    await KV.saveNumber(this.KEY_SYNC_BLOCK_NUM, tx.blockNumber - 1);
    this.curBlock = tx.blockNumber;
  }

  private index = 0;
  private blocks = {
    1: [
      222580207, 222581330, 222582240, 222582270, 222582542, 222602730, 222606219, 222606576, 222607691, 222608813, 222608883,
      222618718, 223248750, 223248798, 231702211, 231971919, 232326566, 232327271, 233355460, 238483597, 242223195, 242615447,
      243372240, 243372621, 243372713
    ],
    71: [
      202828535, 206425670, 209538240, 209540620, 209541820, 209543025, 216452570, 216776065, 222465990, 222466030, 222466235,
      222467635, 222467810, 222493500, 222501640, 222502505, 222608955, 222610780, 222617165, 222617210, 223251260, 223251475,
      223732420, 224601030, 232630775, 233242920, 235279385, 238558520, 238922430, 239364320, 239364700, 239364850, 239365950,
      239369195, 239369240, 239432240, 239432295, 239435355, 239444820, 240849915, 240850320, 242990974
    ],
    1029: [
      116740429, 118660985, 120041485, 122231556, 125115133, 125484223, 126455536, 126455644, 130282566, 130282922, 135041586,
      135317637, 135519221, 135519548
    ],
    1030: [
      113238665, 113239655, 113239785, 113240015, 114793755, 114793825, 115758000, 118330365, 118330661, 118331590, 118333770,
      118335940, 119994060, 119994668, 119994720, 119999095, 120050380, 121755762, 122913340, 123176945, 125596816, 125755510,
      125755780, 125755838, 125757375, 125758455, 125759700, 125766620, 126358505, 127098565, 127237480, 127938745, 127961665,
      128011120, 128077800, 128079115, 128495665, 128559575, 128585135, 128775525, 128775930, 128776025, 128848455, 128850045,
      128850270, 128850295, 128850690, 128850750, 128882965, 129564880, 129707293, 129707360, 129707710, 129991610, 130293310,
      130540500, 130836135, 130836195, 130851735, 130866460, 130867025, 130920100, 131215785, 131215915, 131240160, 131240200,
      131466790, 131566585, 131698122, 132238200, 133124240, 133125325, 133137320, 133137470, 133137560, 133137640, 133137695,
      133138097, 133143845, 133164665, 133167547, 133170780, 133170880, 133207055, 133310235, 133916655, 135015057, 135058160,
      135447955, 135804145, 135804245, 135885870, 135998350, 136890995, 137823120, 137874895, 137876080, 138215565, 139023135,
      139050250, 139272660, 140302145
    ]
  };

  async sync() {
    // @ts-ignore
    const blk = this.blocks[this.chainId][this.index++];
    if (blk && blk >= this.curBlock) {
      this.curBlock = blk;
    }
    const receipts: any[] = await this.chain.getBlockReceipts(this.curBlock);
    console.log(`debug sync ===1=== ${this.curBlock} ${receipts.length}`)

    const statusFilter = this.chain.corespace ?
      (receipt: any) => receipt.outcomeStatus === 0 :
      (receipt: any) => receipt.status === "0x1";

    const announces = receipts
      .filter(statusFilter)
      .flatMap(receipt =>
        receipt.logs
          .map((log: any) => decodeAnnounce(log))
          .filter(Boolean)
      );

    const list: Tables.IAbiInfo[] = [];
    for (const announce of announces) {
      if (format.hexAddress(announce.address) !== this.announcement) {
        continue;
      }

      if (Buffer.from(announce.key, "base64").toString() !== "contract/abi") {
        continue;
      }

      const value = Buffer.from(announce.value, "base64").toString();
      const abiArr = JSON.parse(value);
      const iFace = new Interface(abiArr);

      iFace.forEachFunction(func => {
        const signature = func.format("sighash");
        const full_format = func.format("full");
        if (signature.length > Tables.MAX_LEN_EVENT_SIG ||
          full_format.length > Tables.MAX_LEN_EVENT_SIG * 4) {
          return;
        }
        list.push({ hash: func.selector, signature, full_format });
      });
    }

    const len = list.length;
    if (len) {
      await AbiInfo.bulkCreate(list, { updateOnDuplicate: ["full_format", "updatedAt"] });
      console.log(`Stored abi ${this.chainId} ${this.curBlock} ${len}`);
    }

    await KV.saveNumber(this.KEY_SYNC_BLOCK_NUM, this.curBlock);
    this.resetInterval();

    this.curBlock++;
  }

  get chainId() {
    return this.chain.chainId;
  }

  public async start() {
    await this.loadLastSyncBlock();

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    async function repeat() {
      if (!that.running) {
        console.log(`Monitor chain ${that.chain.chainId} closed`);
        return;
      }

      await that.sync().catch(() => {
        that.adaptInterval();
      });
      setTimeout(repeat, that.interval);
    }

    repeat().then();
  }

  public stop() {
    this.running = false;
  }

  private adaptInterval = (increase: boolean = true) => {
    this.interval += (increase ? 1 : -1) * this.intervalAdjustStep;
    this.interval = Math.min(this.interval, this.intervalUpperLimit);
    this.interval = Math.max(this.interval, this.intervalLowerLimit);
  };

  private resetInterval = () => {
    this.interval = 0;
  };
}

