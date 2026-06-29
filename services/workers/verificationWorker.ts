import Piscina from "piscina";
import {
  SourcifyLibError
} from "@ethereum-sourcify/lib-sourcify";
import { resolve } from "path";
import { SolcLocal } from "../compiler/SolcLocal";
import { VyperLocal } from "../compiler/VyperLocal";
import { FeLocal } from "../compiler/FeLocal";
import { v4 as uuidv4 } from "uuid";
import { getCreatorTx } from "../utils/contract-creation-util";
import type {
  VerifyErrorExport,
  VerifyFromConfluxscanInput,
  VerifyFromJsonInput,
  VerifyFromMetadataInput,
  VerifyOutput,
  VerificationWorkerInput,
} from "./workerTypes";
import {
  getCompilationFromEtherscanResult
} from "../utils/confluxscan-util";
import { asyncLocalStorage } from "../../common/async-context";
import { Chain } from "../chain/Chain";
import { ChainInstance } from "../../config/Loader";
import { ChainMap } from "../../server";
import { Verification } from "./Verification";
import { SolidityCompilation } from "../compilation/SolidityCompilation";
import { SolidityMetadataContract } from "../validation/SolidityMetadataContract";
import { useAllSourcesAndReturnCompilation } from "../validation/processFiles";
import logger from "../log/logger";
import { createCompilationFromJsonInput } from '../utils/compilation';
import { AnyCompilation } from '../compilation/CompilationTypes';
import { VyperCompilation } from "../compilation/VyperCompilation";

export const filename = resolve(__filename);

let chainMap: { [chainId: string]: Chain };
let solc: SolcLocal;
let vyper: VyperLocal;
let fe: FeLocal;

const initWorker = () => {
  if (chainMap && solc && vyper && fe) {
    return;
  }

  const chainInstanceMap = Piscina.workerData.chains as {
    [chainId: string]: ChainInstance;
  };

  chainMap = Object.entries(chainInstanceMap).reduce(
    (acc, [chainId, chain]) => {
      acc[chainId] = new Chain(chain);
      return acc;
    },
    {} as ChainMap,
  );

  solc = new SolcLocal(
    Piscina.workerData.solcRepoPath,
    Piscina.workerData.solJsonRepoPath,
  );

  vyper = new VyperLocal(Piscina.workerData.vyperRepoPath);
  fe = new FeLocal(Piscina.workerData.feRepoPath);
};

async function runWorkerFunctionWithContext<T extends VerificationWorkerInput>(
  workerFunction: (input: T) => Promise<VerifyOutput>,
  input: T,
): Promise<VerifyOutput> {
  initWorker();
  // We need to inject the traceId for the logger here since the worker is running in its own thread.
  const context = { traceId: input.traceId };
  return asyncLocalStorage.run(context, workerFunction, input);
}

export async function verifyFromJsonInput(
  input: VerifyFromJsonInput,
): Promise<VerifyOutput> {
  return runWorkerFunctionWithContext(_verifyFromJsonInput, input);
}

export async function verifyFromMetadata(
  input: VerifyFromMetadataInput,
): Promise<VerifyOutput> {
  return runWorkerFunctionWithContext(_verifyFromMetadata, input);
}

export async function verifyFromConfluxscan(
  input: VerifyFromConfluxscanInput,
): Promise<VerifyOutput> {
  return runWorkerFunctionWithContext(_verifyFromConfluxscan, input);
}

async function _verifyFromJsonInput({
  chainId,
  address,
  jsonInput,
  compilerVersion,
  compilationTarget,
  creationTransactionHash,
}: VerifyFromJsonInput): Promise<VerifyOutput> {
  let compilation: AnyCompilation;
  try {
    compilation = createCompilationFromJsonInput(
      { solc, vyper, fe },
      compilerVersion,
      jsonInput,
      compilationTarget,
    );
  } catch (error: any) {
    return {
      errorExport: createErrorExport(error),
    };
  }

  if (!compilation) {
    return {
      errorExport: {
        customCode: "unsupported_language",
        errorId: uuidv4(),
      },
    };
  }

  const chain = chainMap[chainId];
  const foundCreationTxHash =
    creationTransactionHash ||
    (await getCreatorTx(chain, address)) ||
    undefined;

  const verification = new Verification(
    compilation,
    chain,
    address,
    foundCreationTxHash,
  );

  try {
    if (compilationTarget.name) {
      await verification.verify();
    } else {
      await verification.verifyWithBestEfforts();
    }
  } catch (error: any) {
    return {
      errorExport: createErrorExport(error, verification),
    };
  }

  return {
    verificationExport: verification.export(),
  };
}

async function _verifyFromMetadata({
  chainId,
  address,
  metadata,
  sources,
  creationTransactionHash,
}: VerifyFromMetadataInput): Promise<VerifyOutput> {
  const sourcesList = Object.entries(sources).map(([path, content]) => ({
    path,
    content,
  }));
  const metadataContract = new SolidityMetadataContract(metadata, sourcesList);

  let compilation: SolidityCompilation;
  try {
    // Includes fetching missing sources
    compilation = await metadataContract.createCompilation(solc);
  } catch (error: any) {
    return {
      errorExport: createErrorExport(error),
    };
  }

  const chain = chainMap[chainId];
  const foundCreationTxHash =
    creationTransactionHash ||
    (await getCreatorTx(chain, address)) ||
    undefined;

  let verification = new Verification(
    compilation,
    chain,
    address,
    foundCreationTxHash,
  );

  try {
    await verification.verify();
  } catch (error: any) {
    if (error.code !== "extra_file_input_bug") {
      return {
        errorExport: createErrorExport(error, verification),
      };
    }
    logger.info("Found extra-file-input-bug", {
      contract: metadataContract.name,
      chainId,
      address,
    });

    const sourcesBuffer = sourcesList.map(({ path, content }) => ({
      path,
      buffer: Buffer.from(content),
    }));
    const compilationWithAllSources = await useAllSourcesAndReturnCompilation(
      compilation,
      sourcesBuffer,
    );
    verification = new Verification(
      compilationWithAllSources,
      chain,
      address,
      foundCreationTxHash,
    );

    try {
      await verification.verify();
    } catch (allSourcesError: any) {
      return {
        errorExport: createErrorExport(allSourcesError, verification),
      };
    }
  }

  return {
    verificationExport: verification.export(),
  };
}

async function _verifyFromConfluxscan({
  chainId,
  address,
  confluxscanResult,
}: VerifyFromConfluxscanInput): Promise<VerifyOutput> {
  let compilation: SolidityCompilation | VyperCompilation;
  try {
    compilation = await getCompilationFromEtherscanResult(
      confluxscanResult,
      solc,
      vyper,
    );
  } catch (error: any) {
    return {
      errorExport: createErrorExport(error),
    };
  }

  return _verifyFromJsonInput({
    chainId,
    address,
    jsonInput: compilation.jsonInput,
    compilerVersion: compilation.compilerVersion,
    compilationTarget: compilation.compilationTarget,
  });
}

function createErrorExport(
  error: Error,
  verification?: Verification,
): VerifyErrorExport {
  if (!(error instanceof SourcifyLibError)) {
    // If the error is not a SourcifyLibError, the server reached an unexpected state.
    // Let the VerificationService log and handle it.
    throw error;
  }

  // Use VerificationExport to get bytecodes as it does not throw when accessing properties
  const verificationExport = verification?.export();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { chainId, address, ...jobErrorData } = error.data;

  return {
    customCode: error.code,
    errorId: uuidv4(),
    errorData: Object.keys(jobErrorData).length > 0 ? jobErrorData : undefined,
    onchainRuntimeCode: verificationExport?.onchainRuntimeBytecode,
    onchainCreationCode: verificationExport?.onchainCreationBytecode,
    recompiledRuntimeCode: verificationExport?.compilation.runtimeBytecode,
    recompiledCreationCode: verificationExport?.compilation.creationBytecode,
    creationTransactionHash: verificationExport?.deploymentInfo.txHash,
  };
}
