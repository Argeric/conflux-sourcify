import { SourcifyChain } from "@ethereum-sourcify/lib-sourcify";
import {
  ChainInstance,
  FetchContractCreationTxUsing,
  SyncOptions,
  isConfluxOption
} from "../../config/Loader";
import {
  Block,
  BlockParams,
  JsonRpcProvider, Log,
  Signature,
  toQuantity,
  TransactionReceipt,
  TransactionResponse,
  TransactionResponseParams
} from "ethers";
import { Conflux, format, Transaction } from "js-conflux-sdk";
import cfxFormat from "js-conflux-sdk/dist/types/rpc/types/formatter";
import logger from "../log/logger";

export class Chain extends SourcifyChain {
  readonly baseGetBlockNumber = this.getBlockNumber;
  readonly baseGetBlock = this.getBlock;
  readonly baseGetTx = this.getTx;
  readonly baseGetTxReceipt = this.getTxReceipt;
  readonly baseGetBytecode = this.getBytecode;
  readonly baseGetContractCreationBytecodeAndReceipt =
    this.getContractCreationBytecodeAndReceipt;
  readonly baseGetCreationBytecodeForFactory =
    this.getCreationBytecodeForFactory;

  readonly confluxscanApi?: {
    apiURL: string;
    apiKeyEnvName?: string;
  };
  readonly fetchContractCreationTxUsing?: FetchContractCreationTxUsing;
  readonly corespace: boolean | undefined;
  readonly announcement: string;
  readonly syncOptions?: SyncOptions;
  readonly confluxSdks: Conflux[];

  constructor(chainObj: ChainInstance) {
    super(chainObj);
    this.confluxscanApi = chainObj.confluxscanApi;
    this.fetchContractCreationTxUsing = chainObj.fetchContractCreationTxUsing;
    this.corespace = chainObj.corespace;
    this.announcement = chainObj.announcement;
    this.syncOptions = chainObj.sync;
    this.confluxSdks = [];
    if (this.corespace) {
      for (const rpc of chainObj.rpc) {
        let option: string | Conflux.ConfluxOption;
        if (typeof rpc === "string") {
          option = {
            url: rpc,
            networkId: chainObj.networkId || chainObj.chainId
            // logger: console
          } as Conflux.ConfluxOption;
        } else if (isConfluxOption(rpc)) {
          option = rpc;
        } else {
          throw new Error(
            `Only support conflux rpc type: string | Conflux.ConfluxOption, got rpc ${JSON.stringify(rpc)}`
          );
        }
        this.confluxSdks.push(new Conflux(option));
      }
    }
  }

  // override SourcifyChain method
  getSourcifyChainObj = (): ChainInstance => {
    return {
      name: this.name,
      title: this.title,
      chainId: this.chainId,
      rpc: this.rpc,
      rpcWithoutApiKeys: this.rpcWithoutApiKeys,
      supported: this.supported,
      fetchContractCreationTxUsing: this.fetchContractCreationTxUsing,
      etherscanApi: this.etherscanApi,
      confluxscanApi: this.confluxscanApi,
      traceSupportedRPCs: this.traceSupportedRPCs,
      corespace: this.corespace,
      announcement: this.announcement,
      sync: this.syncOptions
    };
  };

  // override SourcifyChain method
  getTx = async (creatorTxHash: string): Promise<TransactionResponse> => {
    if (!this.corespace) {
      return this.baseGetTx(creatorTxHash);
    }

    for (const sdk of this.confluxSdks) {
      const tx = await Promise.race([
        sdk.getTransactionByHash(creatorTxHash),
        this.rejectInMs(sdk.provider.url)
      ]);

      if (!tx) {
        logger.debug("Failed to fetch tx, not found", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          creatorTxHash
        });
        continue;
      }

      if (!tx.blockHash || tx.transactionIndex == null) {
        logger.debug("Failed to fetch tx, pending", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          creatorTxHash
        });
        continue;
      }

      const block = await this.getBlockByHash(tx.blockHash);
      if (block.epochNumber === undefined) {
        logger.debug("Failed to fetch block, pending", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          blockHash: tx.blockHash
        });
        continue;
      }

      logger.debug("Succeed to fetch tx", {
        providerUrl: sdk.provider.url,
        chainId: this.chainId,
        creatorTxHash
      });

      return new TransactionResponse(
        {
          blockNumber: block.epochNumber,
          blockHash: tx.blockHash,
          hash: tx.hash,
          index: tx.transactionIndex,
          type: tx.type,
          to: tx.to || null,
          from: tx.from,
          nonce: tx.nonce,
          gasLimit: BigInt(tx.gas),
          gasPrice: BigInt(tx.gasPrice),
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas
            ? BigInt(tx.maxPriorityFeePerGas)
            : null,
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null,
          data: tx.data,
          value: BigInt(tx.value),
          chainId: BigInt(tx.chainId),
          signature: Signature.from(),
          accessList: null
        },
        new JsonRpcProvider()
      );
    }

    throw new Error(
      "None of the RPCs responded fetching tx " +
      creatorTxHash +
      " on chain " +
      this.chainId
    );
  };

  // override SourcifyChain method
  getTxReceipt = async (creatorTxHash: string): Promise<TransactionReceipt> => {
    if (!this.corespace) {
      return this.baseGetTxReceipt(creatorTxHash);
    }

    for (const sdk of this.confluxSdks) {
      const rcpt = await Promise.race([
        sdk.getTransactionReceipt(creatorTxHash),
        this.rejectInMs(sdk.provider.url)
      ]);

      if (!rcpt) {
        logger.debug("Failed to fetch receipt, not found", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          creatorTxHash
        });
        continue;
      }

      const block = await this.getBlockByHash(rcpt.blockHash);
      logger.debug("Succeed to fetch receipt", {
        providerUrl: sdk.provider.url,
        chainId: this.chainId,
        creatorTxHash
      });
      return new TransactionReceipt(
        {
          to: rcpt.to || null,
          from: rcpt.from,
          contractAddress: rcpt.contractCreated || null,
          hash: rcpt.transactionHash,
          index: rcpt.index,
          blockHash: rcpt.blockHash,
          blockNumber: block.blockNumber,
          logsBloom: rcpt.logsBloom,
          logs: [],
          gasUsed: BigInt(rcpt.gasUsed),
          cumulativeGasUsed: BigInt(0),
          effectiveGasPrice: BigInt(rcpt.effectiveGasPrice),
          type: rcpt.type,
          status: rcpt.outcomeStatus,
          root: rcpt.stateRoot
        },
        new JsonRpcProvider()
      );
    }

    throw new Error(
      "None of the RPCs responded fetching tx " +
      creatorTxHash +
      " on chain " +
      this.chainId
    );
  };

  // override SourcifyChain method
  getBytecode = async (
    address: string,
    blockNumber?: number
  ): Promise<string> => {
    if (!this.corespace) {
      return this.baseGetBytecode(address, blockNumber);
    }

    let currentProviderIndex = 0;
    const epochNumber = blockNumber;
    for (const sdk of this.confluxSdks) {
      currentProviderIndex++;
      try {
        // Race the RPC call with a timeout
        const bytecode = await Promise.race([
          sdk.getCode(address, epochNumber),
          this.rejectInMs(sdk.provider.url)
        ]);
        logger.debug("Succeed to fetched bytecode", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          address,
          epochNumber,
          bytecodeLength: bytecode.length,
          bytecodeStart: bytecode.slice(0, 32)
        });
        return bytecode;
      } catch (err) {
        if (err instanceof Error) {
          logger.debug("Failed to fetch bytecode", {
            providerUrl: sdk.provider.url,
            chainId: this.chainId,
            address,
            epochNumber,
            error: err.message
          });
        } else {
          throw err;
        }
      }
    }
    throw new Error(
      "None of the RPCs responded fetching bytecode for " +
      address +
      (epochNumber ? ` at epoch ${epochNumber}` : "") +
      " on chain " +
      this.chainId
    );
  };

  // override SourcifyChain method
  getContractCreationBytecodeAndReceipt = async (
    address: string,
    transactionHash: string,
    creatorTx?: TransactionResponse
  ): Promise<{ creationBytecode: string; txReceipt: TransactionReceipt }> => {
    if (!this.corespace) {
      return this.baseGetContractCreationBytecodeAndReceipt(
        address,
        transactionHash,
        creatorTx
      );
    }

    const txReceipt = await this.getTxReceipt(transactionHash);
    if (!creatorTx) creatorTx = await this.getTx(transactionHash);

    let creationBytecode: string;
    if (txReceipt.contractAddress !== null) {
      if (
        format.hexAddress(txReceipt.contractAddress) !==
        format.hexAddress(address)
      ) {
        throw new Error(
          `Address of the contract being verified ${address} doesn't match the address ${txReceipt.contractAddress} created by this transaction ${transactionHash}`
        );
      }
      creationBytecode = creatorTx.data;
      logger.debug("Contract created with an EOA", { address });
    } else {
      if (!this.traceSupport) {
        throw new Error(
          `No trace support for chain ${this.chainId}. No other method to get the creation bytecode`
        );
      }
      logger.debug("Contract created with a factory", { address });
      creationBytecode = await this.getCreationBytecodeForFactory(
        transactionHash,
        address
      );
    }

    return {
      creationBytecode,
      txReceipt
    };
  };

  // override SourcifyChain method
  getCreationBytecodeForFactory = async (
    creatorTxHash: string,
    address: string
  ): Promise<string> => {
    if (!this.corespace) {
      return this.baseGetCreationBytecodeForFactory(creatorTxHash, address);
    }

    if (!this.traceSupport || !this.traceSupportedRPCs) {
      throw new Error(
        `No trace support for chain ${this.chainId}. No other method to get the creation bytecode`
      );
    }

    for (const traceSupportedRPCObj of this.traceSupportedRPCs) {
      const { type, index } = traceSupportedRPCObj;
      if (type !== "trace_transaction") {
        throw new Error(
          `No trace support for chain ${this.chainId} in type ${type}.`
        );
      }
      const sdk = this.confluxSdks[index];
      try {
        return await this.extractFromParityTrace(creatorTxHash, address, sdk);
      } catch (e: any) {
        logger.debug("Failed to fetch creation bytecode", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          address,
          creatorTxHash,
          error: e.message
        });
      }
    }

    throw new Error(
      "None of the RPCs responded fetching creation bytecode for " +
      address +
      " with tx " +
      creatorTxHash +
      " on chain " +
      this.chainId
    );
  };

  extractFromParityTrace = async (
    creatorTxHash: string,
    address: string,
    sdk: Conflux
  ): Promise<string> => {
    const traces: any[] = await Promise.race([
      sdk.traceTransaction(creatorTxHash),
      this.rejectInMs(sdk.provider.url)
    ]);
    if (traces instanceof Array && traces.length > 0) {
      logger.debug("Succeed to fetch traces", {
        providerUrl: sdk.provider.url,
        chainId: this.chainId,
        creatorTxHash,
      });
    } else {
      throw new Error(
        `Transaction's traces of ${creatorTxHash} on RPC ${sdk.provider.url} and chain ${this.chainId} received empty or malformed response`
      );
    }

    let createTrace: any;
    const createTraces = [];
    const normalizedAddress = format.hexAddress(address);
    for (const trace of traces) {
      if (trace.type === "create") {
        createTraces.push(trace);
      }
      if (trace.type === "create_result") {
        if (
          trace?.action?.addr &&
          format.hexAddress(trace.action.addr) === normalizedAddress
        ) {
          createTrace = createTraces.pop();
          break;
        } else {
          createTraces.pop();
        }
      }
    }
    if (!createTrace) {
      throw new Error(
        `Provided tx ${creatorTxHash} does not create the expected contract ${address}. Created contracts by this tx: ${createTraces.map((t) => t.action.addr).join(", ")}`
      );
    }
    logger.debug("Succeed to found creation bytecode in traces", {
      providerUrl: sdk.provider.url,
      chainId: this.chainId,
      address,
      creatorTxHash,
    });

    if (createTrace.action.init) {
      return createTrace.action.init as string;
    } else {
      throw new Error(".action.init not found in traces");
    }
  };

  getBlockByHash = async (
    blockHash: string,
    preFetchTxs = false
  ): Promise<cfxFormat.Block> => {
    for (const sdk of this.confluxSdks) {
      try {
        // Race the RPC call with a timeout
        const block = await Promise.race([
          sdk.getBlockByHash(blockHash, preFetchTxs),
          this.rejectInMs(sdk.provider.url)
        ]);
        if (!block) {
          logger.debug("Failed to fetch block, not published yet", {
            providerUrl: sdk.provider.url,
            chainId: this.chainId,
            blockHash
          });
          continue;
        }

        logger.debug("Succeed to fetch block", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          blockHash
        });
        return block;
      } catch (err: any) {
        logger.debug("Failed to fetch block", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          blockHash,
          error: err.message
        });
      }
    }

    logger.debug("None of the RPCs responded fetching block", {
      providers: this.providers.map((p) => p.url),
      chainId: this.chainId,
      blockHash
    });
    throw new Error(
      "None of the RPCs responded fetching block " +
      blockHash +
      " on chain " +
      this.chainId
    );
  };

  getBlockNumber = async (): Promise<number> => {
    if (!this.corespace) {
      return this.baseGetBlockNumber();
    }

    for (const sdk of this.confluxSdks) {
      try {
        const epochNumber = await Promise.race([
          sdk.getEpochNumber(),
          this.rejectInMs(sdk.provider.url)
        ]);
        logger.debug("Succeed to fetch epochNumber", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          epochNumber
        });
        return epochNumber;
      } catch (err) {
        if (err instanceof Error) {
          logger.debug("Failed to fetch epochNumber", {
            providerUrl: sdk.provider.url,
            chainId: this.chainId,
            error: err.message
          });
        } else {
          throw err;
        }
      }
    }
    throw new Error(
      `None of the RPCs responded fetching the epochNumber on chain ${this.chainId}`
    );
  };

  getBlock = async (
    blockNumber: number,
    preFetchTxs = true
  ): Promise<Block> => {
    if (!this.corespace) {
      return this.baseGetBlock(blockNumber, preFetchTxs);
    }

    const epochNumber = blockNumber;
    for (const sdk of this.confluxSdks) {
      try {
        const hashes = await sdk
          .getBlocksByEpochNumber(epochNumber)
          .catch((err) => {
            const msg = `${err}`;
            if (
              !msg.includes(
                "expected a numbers with less than largest epoch number."
              )
            ) {
              logger.debug("Failed to fetch blocks", {
                providerUrl: sdk.provider.url,
                chainId: this.chainId,
                epochNumber,
                error: err
              });
            }
            return [];
          });

        if (hashes.length) {
          const blocks = await Promise.race([
            Promise.all(
              hashes.map((hash) => {
                return sdk.getBlockByHash(hash, preFetchTxs);
              })
            ),
            this.rejectInMs(sdk.provider.url)
          ]);

          if (hashes.length === blocks.length) {
            const params = this.buildBlockParams(blocks);
            logger.debug("Succeed to fetch epoch", {
              providerUrl: sdk.provider.url,
              chainId: this.chainId,
              epochNumber
            });
            return new Block(params, sdk.provider);
          } else {
            logger.debug("Failed to fetch epoch, not published yet", {
              providerUrl: sdk.provider.url,
              chainId: this.chainId,
              epochNumber
            });
          }
        }
      } catch (err: any) {
        logger.debug("Failed to fetch epoch", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          epochNumber,
          error: err.message
        });
      }
    }

    logger.debug("None of the RPCs responded fetching epoch", {
      providers: this.providers.map((p) => p.url),
      chainId: this.chainId,
      epochNumber,
    });
    throw new Error(
      `None of the RPCs responded fetching epoch ${epochNumber} on chain ${this.chainId}`
    );
  };

  buildBlockParams = (blocks: any[]): BlockParams => {
    const pivotBlock = blocks[blocks.length - 1];

    const transactions = [] as TransactionResponseParams[];
    let txIndex = 0;
    for (const block of blocks) {
      for (const tx of block.transactions as Transaction[]) {
        transactions.push({
          blockNumber: pivotBlock.epochNumber,
          blockHash: pivotBlock.hash,
          hash: tx.hash,
          index: txIndex++,
          type: tx.type,
          to: tx.to,
          from: tx.from,
          nonce: Number(tx.nonce),
          gasLimit: BigInt(tx.gas),
          gasPrice: BigInt(tx.gasPrice),
          maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas || 0),
          maxFeePerGas: BigInt(tx.maxFeePerGas || 0),
          data: tx.data.toString(),
          value: BigInt(tx.value),
          chainId: BigInt(tx.chainId),
          signature: Signature.from(),
          accessList: null
        } as TransactionResponseParams);
      }
    }

    return {
      hash: pivotBlock.hash,
      number: pivotBlock.epochNumber,
      timestamp: pivotBlock.timestamp,
      parentHash: pivotBlock.parentHash,
      nonce: `${pivotBlock.nonce}`,
      difficulty: BigInt(pivotBlock.difficulty),
      gasLimit: BigInt(pivotBlock.gasLimit),
      gasUsed: BigInt(pivotBlock.gasUsed),
      miner: pivotBlock.miner,
      extraData: "",
      baseFeePerGas: BigInt(pivotBlock.baseFeePerGas || 0),
      transactions: transactions
    } as BlockParams;
  };

  getBlockReceipts = async (
    blockNumber: number
  ): Promise<any[]> => {
    if (this.corespace) {
      return this.getEpochReceipts(blockNumber);
    }

    for (const provider of this.providers) {
      try {
        const receipts = await provider.send("eth_getBlockReceipts", [toQuantity(blockNumber)]);
        if (receipts) {
          logger.debug("Succeed to fetch receipts", {
            providerUrl: provider.url,
            chainId: this.chainId,
            blockNumber
          });
          return receipts;
        } else {
          logger.debug("Failed to fetch receipts，not published yet", {
            providerUrl: provider.url,
            chainId: this.chainId,
            blockNumber
          });
        }
      } catch (err: any) {
        logger.debug("Failed to fetch receipts", {
          providerUrl: provider.url,
          chainId: this.chainId,
          blockNumber,
          error: err.message
        });
      }
    }

    logger.debug("None of the RPCs responded fetching receipts", {
      providers: this.providers.map((p) => p.url),
      chainId: this.chainId,
      blockNumber
    });
    throw new Error(
      `None of the RPCs responded fetching block receipts ${blockNumber} on chain ${this.chainId}`
    );
  };

  getEpochReceipts = async (
    epochNumber: number
  ): Promise<any[]> => {
    for (const sdk of this.confluxSdks) {
      try {
        const receipts: any[][] = await sdk.getEpochReceipts(epochNumber);
        if (receipts) {
          logger.debug("Succeed to fetch epoch receipts", {
            providerUrl: sdk.provider.url,
            chainId: this.chainId,
            epochNumber
          });
          return receipts.flat();
        } else {
          logger.debug("Failed to fetch epoch receipts, not published yet", {
            providerUrl: sdk.provider.url,
            chainId: this.chainId,
            epochNumber,
          });
        }
      } catch (err: any) {
        logger.debug("Failed to fetch epoch receipts", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          epochNumber,
          error: err.message
        });
      }
    }

    logger.debug("None of the RPCs responded fetching epoch receipts", {
      providers: this.confluxSdks.map((p) => p.provider.url),
      chainId: this.chainId,
      epochNumber
    });
    throw new Error(
      `None of the RPCs responded fetching epoch receipts ${epochNumber} on chain ${this.chainId}`
    );
  };

  getBlockByTag = async (tag: string): Promise<number> => {
    const errs = [];
    if (!this.corespace) {
      for (const provider of this.providers) {
        try {
          const block = await Promise.race([
            provider.getBlock(tag, false),
            this.rejectInMs(provider.url)
          ]);
          if (block) {
            return block.number;
          }
        } catch (err: any) {
          errs.push({ url: provider.url, error: err.message });
          logger.debug("Failed to fetch blockNumber", {
            providerUrl: provider.url,
            chainId: this.chainId,
            tag,
            error: err.message
          });
        }
      }

      throw new Error(
        `None of the RPCs responded fetching blockNumber from chain ${this.chainId}. ${JSON.stringify(errs)}`
      );
    }

    for (const sdk of this.confluxSdks) {
      try {
        const epochNumber = await Promise.race([
          sdk.getEpochNumber(tag),
          this.rejectInMs(sdk.provider.url)
        ]);
        return epochNumber;
      } catch (err: any) {
        errs.push({ url: sdk.provider.url, error: err.message });
        logger.debug("Failed to fetch epochNumber", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          error: err.message
        });
      }
    }

    throw new Error(
      `None of the RPCs responded fetching epochNumber from chain ${this.chainId}. ${JSON.stringify(errs)}`
    );
  };

  getLogs = async (
    fromBlock: number,
    toBlock: number,
    address: string | string[],
    topics: string[]
  ): Promise<Log[] | cfxFormat.Log[]> => {
    const errs = [];
    if (!this.corespace) {
      for (const provider of this.providers) {
        try {
          const logs = await Promise.race([
            provider.getLogs({
              fromBlock,
              toBlock,
              address,
              topics
            }),
            this.rejectInMs(provider.url)
          ]);
          return logs;
        } catch (err: any) {
          errs.push({ url: provider.url, error: err.message });
          logger.debug("Failed to fetch logs", {
            providerUrl: provider.url,
            chainId: this.chainId,
            error: err.message
          });
        }
      }

      throw new Error(
        `None of the RPCs responded fetching logs from chain ${this.chainId}. ${JSON.stringify(errs)}`
      );
    }

    for (const sdk of this.confluxSdks) {
      try {
        const logs = await Promise.race([
          sdk.getLogs({
            fromEpoch: fromBlock,
            toEpoch: toBlock,
            address,
            topics
          }),
          this.rejectInMs(sdk.provider.url)
        ]);
        return logs;
      } catch (err: any) {
        errs.push({ url: sdk.provider.url, error: err.message });
        logger.debug("Failed to fetch logs", {
          providerUrl: sdk.provider.url,
          chainId: this.chainId,
          error: err.message
        });
      }
    }

    throw new Error(
      `None of the RPCs responded fetching logs from chain ${this.chainId}. ${JSON.stringify(errs)}`
    );
  };
}
