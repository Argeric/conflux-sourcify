import type {
  Metadata,
  VyperJsonInput,
  SolidityJsonInput,
  CompilationTarget,
} from "@ethereum-sourcify/lib-sourcify";
import { TypedResponse } from "../../types";
import { Request } from "express";
import { Services } from "../../../services/services";
import { StatusCodes } from "http-status-codes";
import { fetchFromConfluxscan } from "../../../services/utils/confluxscan-util";
import { getChainId } from "../errors";
import { ChainMap } from "../../../server";
import _ from "lodash";

interface VerifyFromJsonInputRequest extends Request {
  params: {
    chainId: string;
    address: string;
  };
  body: {
    stdJsonInput: SolidityJsonInput | VyperJsonInput;
    compilerVersion: string;
    contractIdentifier: string;
    constructorArguments?: string;
    creationTransactionHash?: string;
    licenseType?: number;
    contractLabel?: string;
  };
}

type VerifyResponse = TypedResponse<{
  verificationId: string;
}>;

export async function verifyFromJsonInputEndpoint(
  req: VerifyFromJsonInputRequest,
  res: VerifyResponse,
) {
  console.debug("verifyFromJsonInputEndpoint", {
    chainId: req.params.chainId,
    address: req.params.address,
    stdJsonInput: req.body.stdJsonInput,
    compilerVersion: req.body.compilerVersion,
    contractIdentifier: req.body.contractIdentifier,
    constructorArguments: req.body.constructorArguments,
    creationTransactionHash: req.body.creationTransactionHash,
    licenseType: req.body.licenseType,
    contractLabel: req.body.contractLabel,
  });

  // The contract path can include a colon itself. Therefore,
  // we need to take the last element as the contract name.
  const splitIdentifier = req.body.contractIdentifier.split(":");
  const contractName = splitIdentifier[splitIdentifier.length - 1];
  const contractPath = splitIdentifier.slice(0, -1).join(":");
  const compilationTarget: CompilationTarget = {
    name: contractName,
    path: contractPath,
  };

  const services = req.app.get("services") as Services;
  const chain = getChainId(req.params.chainId);
  const verificationId =
    await services.verification.verifyFromJsonInputViaWorker(
      req.baseUrl + req.path,
      chain,
      req.params.address,
      req.body.stdJsonInput,
      _.trimStart(req.body.compilerVersion, "v"),
      compilationTarget,
      req.body.constructorArguments,
      req.body.creationTransactionHash,
      req.body.licenseType,
      req.body.contractLabel,
    );

  res.status(StatusCodes.ACCEPTED).json({ verificationId });
}

interface VerifyFromMetadataRequest extends Request {
  params: {
    chainId: string;
    address: string;
  };
  body: {
    metadata: Metadata;
    sources: Record<string, string>;
    creationTransactionHash?: string;
  };
}

export async function verifyFromMetadataEndpoint(
  req: VerifyFromMetadataRequest,
  res: VerifyResponse,
) {
  console.debug("verifyFromMetadataEndpoint", {
    chainId: req.params.chainId,
    address: req.params.address,
    sources: req.body.sources,
    metadata: req.body.metadata,
    creationTransactionHash: req.body.creationTransactionHash,
  });

  const services = req.app.get("services") as Services;
  const chain = getChainId(req.params.chainId);
  const verificationId =
    await services.verification.verifyFromMetadataViaWorker(
      req.baseUrl + req.path,
      chain,
      req.params.address,
      req.body.metadata,
      req.body.sources,
      req.body.creationTransactionHash,
    );

  res.status(StatusCodes.ACCEPTED).json({ verificationId });
}

interface VerifyFromConfluxscanRequest extends Request {
  params: {
    chainId: string;
    address: string;
  };
  body: {
    apiKey?: string;
  };
}

export async function verifyFromConfluxscanEndpoint(
  req: VerifyFromConfluxscanRequest,
  res: VerifyResponse,
) {
  console.debug("verifyFromConfluxscanEndpoint", {
    chainId: req.params.chainId,
    address: req.params.address,
  });

  const chainMap = req.app.get("chains") as ChainMap;

  // Fetch here to give early feedback to the user.
  // Then, process in worker.
  const confluxscanResult = await fetchFromConfluxscan(
    chainMap[req.params.chainId],
    req.params.address,
    req.body?.apiKey,
  );

  const services = req.app.get("services") as Services;
  const chain = getChainId(req.params.chainId);
  const verificationId =
    await services.verification.verifyFromConfluxscanViaWorker(
      req.baseUrl + req.path,
      chain,
      req.params.address,
      confluxscanResult,
    );

  res.status(StatusCodes.ACCEPTED).json({ verificationId });
}

interface VerifyFromCrossChainRequest extends Request {
  params: {
    chainId: string;
    address: string;
  };
  body: {
    linkChainIds?: string;
  };
}

export async function verifyFromCrossChainEndpoint(
  req: VerifyFromCrossChainRequest,
  res: VerifyResponse,
) {
  console.debug("verifyFromCrossChainEndpoint", {
    chainId: req.params.chainId,
    address: req.params.address,
  });

  const services = req.app.get("services") as Services;
  const chain = getChainId(req.params.chainId);
  const linkChainIds = req.body?.linkChainIds
    ?.split(",")
    .map(Number)
    .filter(Boolean);

  const verificationId =
    await services.verification.verifyFromCrossChainViaWorker(
      req.baseUrl + req.path,
      chain,
      req.params.address,
      linkChainIds,
    );

  res.status(StatusCodes.ACCEPTED).json({ verificationId });
}
