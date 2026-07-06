import {
  BytesLike,
  Contract,
  ContractFactory,
  Interface,
  InterfaceAbi,
  JsonFragment,
  JsonRpcSigner
} from "ethers";
import chai from "chai";
import chaiHttp from "chai-http";
import { ServerFixture } from "./ServerFixture";
import sinon from "sinon";
import { QueryTypes, Sequelize } from "sequelize";
import { LocalChainFixture } from "./LocalChainFixture";
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import { assertJobVerification } from "./assertions";

chai.use(chaiHttp);

export const unusedAddress = "0xf1Df8172F308e0D47D0E5f9521a5210467408535";

export async function deployFromAbiAndBytecode(
  signer: JsonRpcSigner,
  abi: Interface | InterfaceAbi,
  bytecode: BytesLike | { object: string },
  args?: any[],
) {
  const contractFactory = new ContractFactory(abi, bytecode, signer);
  console.log(`Deploying contract ${args?.length ? `with args ${args}` : ""}`);
  const deployment = await contractFactory.deploy(...(args || []));
  await deployment.waitForDeployment();

  const contractAddress = await deployment.getAddress();
  console.log(`Deployed contract at ${contractAddress}`);
  return contractAddress;
}

export type DeploymentInfo = {
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  txIndex: number;
};

/**
 * Creator tx hash is needed for tests. This function returns the tx hash in addition to the contract address.
 *
 */
export async function deployFromAbiAndBytecodeForCreatorTxHash(
  signer: JsonRpcSigner,
  abi: JsonFragment[] | undefined,
  bytecode: BytesLike | { object: string },
  args?: any[],
): Promise<DeploymentInfo> {
  const contractFactory = new ContractFactory(abi || [], bytecode, signer);
  console.log(`Deploying contract ${args?.length ? `with args ${args}` : ""}`);
  const deployment = await contractFactory.deploy(...(args || []));
  await deployment.waitForDeployment();

  const contractAddress = await deployment.getAddress();
  const creationTx = deployment.deploymentTransaction();
  if (!creationTx) {
    throw new Error(`No deployment transaction found for ${contractAddress}`);
  }
  if (creationTx.blockNumber === null) {
    throw new Error(
      `No block number found for deployment transaction ${creationTx.hash}. Block number: ${creationTx.blockNumber}`,
    );
  }
  console.log(
    `Deployed contract at ${contractAddress} with tx ${creationTx.hash}`,
  );

  return {
    contractAddress,
    txHash: creationTx.hash,
    blockNumber: creationTx.blockNumber,
    txIndex: creationTx.index,
  };
}

/**
 * Takes the creation bytecode as it is and runs it in a transaction.
 * Assumes that constructor arguments are already appended.
 */
export async function deployFromBytecodeForCreatorTxHash(
  signer: JsonRpcSigner,
  bytecode: string,
): Promise<DeploymentInfo> {
  console.log(`Deploying contract from bytecode`);
  const tx = await signer.sendTransaction({
    data: bytecode,
  });
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error(`No receipt found for transaction ${tx.hash}`);
  }
  if (!receipt.contractAddress) {
    throw new Error(
      `No contract address found in receipt for transaction ${tx.hash}`,
    );
  }
  if (receipt.blockNumber === null) {
    throw new Error(
      `No block number found for deployment transaction ${tx.hash}. Block number: ${receipt.blockNumber}`,
    );
  }
  console.log(
    `Deployed contract at ${receipt.contractAddress} with tx ${tx.hash}`,
  );

  return {
    contractAddress: receipt.contractAddress,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    txIndex: receipt.index,
  };
}

/*export async function verifyContract(
  serverFixture: ServerFixture,
  chainFixture: LocalChainFixture,
  contractAddress?: string,
  creatorTxHash?: string,
  partial: boolean = false,
) {
  await chai
    .request(serverFixture.server.app)
    .post("/")
    .field("address", contractAddress || chainFixture.defaultContractAddress)
    .field("chain", chainFixture.chainId)
    .field(
      "creatorTxHash",
      creatorTxHash || chainFixture.defaultContractCreatorTx,
    )
    .attach(
      "files",
      partial
        ? chainFixture.defaultContractModifiedMetadata
        : chainFixture.defaultContractMetadata,
      "metadata.json",
    )
    .attach(
      "files",
      partial
        ? chainFixture.defaultContractModifiedSource
        : chainFixture.defaultContractSource,
    );
}*/

export async function verifyContract(
  serverFixture: ServerFixture,
  chainFixture: LocalChainFixture,
  contractAddress?: string,
  creatorTxHash?: string,
  partial: boolean = false,
) {
  const verifyRequest = {
    stdJsonInput:
      partial
        ? chainFixture.defaultContractModifiedJsonInput
        : chainFixture.defaultContractJsonInput,
    compilerVersion:
      partial
        ? chainFixture.defaultContractModifiedMetadataObject.compiler.version
        : chainFixture.defaultContractMetadataObject.compiler.version,
    contractIdentifier: Object.entries(
      partial
        ? chainFixture.defaultContractModifiedMetadataObject.settings.compilationTarget
        : chainFixture.defaultContractMetadataObject.settings.compilationTarget
    )[0].join(":"),
    creationTransactionHash:
      creatorTxHash || chainFixture.defaultContractCreatorTx,
  }
  const verifyResponse = await chai
    .request(serverFixture.server.app)
    .post(
      `/verify/${chainFixture.chainId}/${contractAddress || chainFixture.defaultContractAddress}`,
    )
    .send(verifyRequest);

  chai
    .expect(verifyResponse.status)
    .to.equal(202, "Response body: " + JSON.stringify(verifyResponse.body));
  chai.expect(verifyResponse.body).to.have.property("verificationId");
  chai
    .expect(verifyResponse.body.verificationId)
    .to.match(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    );

  await completeVerification(
    serverFixture.server.app,
    verifyResponse.body.verificationId,
  );
}

export async function completeVerification(
  app: express.Application,
  verificationId: string,
  interval: number = 3,
  retries: number = 10,
) {
  while (retries-- > 0) {
    const resp = await chai.request(app).get(`/verify/${verificationId}`);

    if (resp?.body?.isJobCompleted) {
      break;
    }

    await waitSecs(interval);
  }
}

export async function deployAndVerifyContract(
  chainFixture: LocalChainFixture,
  serverFixture: ServerFixture,
  partial: boolean = false,
) {
  const { contractAddress, txHash } =
    await deployFromAbiAndBytecodeForCreatorTxHash(
      chainFixture.localSigner,
      chainFixture.defaultContractArtifact.abi,
      chainFixture.defaultContractArtifact.bytecode,
      [],
    );
  await verifyContract(
    serverFixture,
    chainFixture,
    contractAddress,
    txHash,
    partial,
  );
  return contractAddress;
}

/**
 * Await `secs` seconds
 * @param  {Number} secs seconds
 * @return {Promise}
 */
export function waitSecs(secs = 0) {
  return new Promise((resolve) => setTimeout(resolve, secs * 1000));
}

// Sends a tx that changes the state
export async function callContractMethodWithTx(
  signer: JsonRpcSigner,
  abi: JsonFragment[],
  contractAddress: string,
  methodName: string,
  args: any[],
) {
  const contract = new Contract(contractAddress, abi, signer);
  const txResponse = await contract[methodName].send(...args);
  const txReceipt = await txResponse.wait();
  return txReceipt;
}

export async function readFilesFromDirectory(dirPath: string) {
  try {
    const filesContent: Record<string, string> = {};
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        const content = await fs.readFile(filePath, "utf8");
        filesContent[file] = content;
      }
    }
    return filesContent;
  } catch (error) {
    console.error("Error reading files from directory:", error);
    throw error;
  }
}

export async function resetDatabase(database: Sequelize) {
  if (!database) {
    chai.assert.fail("Database pool not configured");
  }

  await database.query("DELETE FROM verification_jobs;");
  await database.query("DELETE FROM verification_jobs_ephemeral;");
  await database.query("DELETE FROM sourcify_matches;");
  await database.query("DELETE FROM verified_contracts;");
  await database.query("DELETE FROM contract_deployments;");
  await database.query("DELETE FROM compiled_contracts_sources;");
  await database.query("DELETE FROM sources;");
  await database.query("DELETE FROM compiled_contracts;");
  await database.query("DELETE FROM contracts;");
  await database.query("DELETE FROM code;");

  await database.query("ALTER TABLE sourcify_matches AUTO_INCREMENT = 1;");
}

export async function testPartialUpgrade(
  serverFixture: ServerFixture,
  chainFixture: LocalChainFixture,
  matchType: "creation" | "runtime",
) {
  /*const partialMetadata = (
    await import("../testcontracts/Storage/metadataModified.json")
  ).default;
  const partialMetadataBuffer = Buffer.from(JSON.stringify(partialMetadata));

  const partialSourcePath = path.join(
    __dirname,
    "..",
    "testcontracts",
    "Storage",
    "StorageModified.sol",
  );
  const partialSourceBuffer = readFileSync(partialSourcePath);*/

  /*let res = await chai
    .request(serverFixture.server.app)
    .post("/")
    .field("address", chainFixture.defaultContractAddress)
    .field("chain", chainFixture.chainId)
    .field("creatorTxHash", chainFixture.defaultContractCreatorTx)
    .attach("files", partialMetadataBuffer, "metadata.json")
    .attach("files", partialSourceBuffer);
  await assertVerification(
    serverFixture,
    null,
    res,
    null,
    chainFixture.defaultContractAddress,
    chainFixture.chainId,
    "partial",
  );*/
  const sandbox = sinon.createSandbox();
  const makeWorkersWait = hookIntoVerificationWorkerRun(sandbox, serverFixture);
  const { resolveWorkers, runTaskStub } = makeWorkersWait();
  let verifyRes = await chai
    .request(serverFixture.server.app)
    .post(
      `/verify/metadata/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
    )
    .send({
      sources: {
        [Object.keys(chainFixture.defaultContractModifiedMetadataObject.sources)[0]]:
          chainFixture.defaultContractModifiedSource.toString(),
      },
      metadata: chainFixture.defaultContractModifiedMetadataObject,
      creationTransactionHash: chainFixture.defaultContractCreatorTx,
    });
  await assertJobVerification(
    serverFixture,
    verifyRes,
    resolveWorkers,
    chainFixture.chainId,
    chainFixture.defaultContractAddress,
    "match",
  );

  const contractMatchesWithPartialMetadata: any[] =
    await serverFixture.sourcifyDatabase.query(
      "SELECT runtime_match, creation_match FROM sourcify_matches;",
      {
        type: QueryTypes.SELECT,
      }
    );

  chai
    .expect(contractMatchesWithPartialMetadata[0].runtime_match)
    .to.equal("partial");
  chai
    .expect(contractMatchesWithPartialMetadata[0].creation_match)
    .to.equal("partial");

  const contractDeploymentWithoutCreatorTransactionHash: any[] =
    await serverFixture.sourcifyDatabase.query(
      "SELECT encode(transaction_hash, 'hex') as transaction_hash, block_number, transaction_index, contract_id FROM contract_deployments",
      {
        type: QueryTypes.SELECT,
      }
    );
  const contractIdWithoutCreatorTransactionHash =
    contractDeploymentWithoutCreatorTransactionHash[0].contract_id;

  // Force perfect ${matchType}Match by setting sourcify_match.${matchType}Match = "perfect" and moving contract to full_match
  await serverFixture.sourcifyDatabase.query(
    `UPDATE sourcify_matches SET ${matchType}_match='perfect' WHERE 1=1`,
    {
      type: QueryTypes.UPDATE,
    }
  );

  /*const existingPath = path.join(
    config.get("repositoryV1.path"),
    "contracts",
    "partial_match",
    chainFixture.chainId,
    chainFixture.defaultContractAddress,
  );
  const newPath = path.join(
    config.get("repositoryV1.path"),
    "contracts",
    "full_match",
    chainFixture.chainId,
    chainFixture.defaultContractAddress,
  );
  await fs.mkdir(path.dirname(newPath), { recursive: true });
  await fs.rename(existingPath, newPath);*/

  // verify again with original metadata file
  /*res = await chai
    .request(serverFixture.server.app)
    .post("/")
    .field("address", chainFixture.defaultContractAddress)
    .field("chain", chainFixture.chainId)
    .field("creatorTxHash", chainFixture.defaultContractCreatorTx)
    .attach("files", chainFixture.defaultContractMetadata, "metadata.json")
    .attach("files", chainFixture.defaultContractSource);
  await assertVerification(
    serverFixture,
    null,
    res,
    null,
    chainFixture.defaultContractAddress,
    chainFixture.chainId,
  );*/
  runTaskStub.restore();
  const { resolveWorkers: resolveWorkers2 } = makeWorkersWait();
  verifyRes = await chai
    .request(serverFixture.server.app)
    .post(
      `/verify/metadata/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
    )
    .send({
      sources: {
        [Object.keys(chainFixture.defaultContractMetadataObject.sources)[0]]:
          chainFixture.defaultContractSource.toString(),
      },
      metadata: chainFixture.defaultContractMetadataObject,
      creationTransactionHash: chainFixture.defaultContractCreatorTx,
    });
  await assertJobVerification(
    serverFixture,
    verifyRes,
    resolveWorkers2,
    chainFixture.chainId,
    chainFixture.defaultContractAddress,
    "match",
  );

  const contractMatchesWithPerfectMetadata: any[] =
    await serverFixture.sourcifyDatabase.query(
      "SELECT runtime_match, creation_match FROM sourcify_matches;",
      {
        type: QueryTypes.SELECT,
      }
    );

  chai
    .expect(contractMatchesWithPerfectMetadata[0].runtime_match)
    .to.equal("perfect");
  chai
    .expect(contractMatchesWithPerfectMetadata[0].creation_match)
    .to.equal("perfect");

  const contractDeploymentWithCreatorTransactionHash: any[] =
    await serverFixture.sourcifyDatabase.query(
      "SELECT encode(transaction_hash, 'hex') as transaction_hash, block_number, transaction_index, contract_id FROM contract_deployments",
      {
        type: QueryTypes.SELECT,
      }
    );

  const contractIdWithCreatorTransactionHash =
    contractDeploymentWithCreatorTransactionHash[0].contract_id;

  // There should not be a new contract_id
  chai
    .expect(contractIdWithCreatorTransactionHash)
    .to.equal(contractIdWithoutCreatorTransactionHash);

  const sourcesResult: any[] = await serverFixture.sourcifyDatabase.query(
    "SELECT encode(source_hash, 'hex') as source_hash FROM compiled_contracts_sources",
    {
      type: QueryTypes.SELECT,
    }
  );

  chai.expect(sourcesResult).to.have.length(2);
  chai.expect(sourcesResult).to.deep.equal([
    {
      source_hash:
        "fd080cadfc692807b0d856c83148034ab5c47ededd67ea6c93c500a2a0fd4378",
    },
    {
      source_hash:
        "fb898a1d72892619d00d572bca59a5d98a9664169ff850e2389373e2421af4aa",
    },
  ]);
}

/**
 * Should be called inside a describe block.
 * @returns a function that can be called in it blocks to make the verification workers wait.
 */
export function hookIntoVerificationWorkerRun(
  sandbox: sinon.SinonSandbox,
  serverFixture: ServerFixture,
) {
  let fakeResolvers: (() => Promise<void>)[] = [];

  beforeEach(() => {
    fakeResolvers = [];
  });

  afterEach(async () => {
    await Promise.all(fakeResolvers.map((resolver) => resolver()));
  });

  const makeWorkersWait = () => {
    const fakePromise = sinon.promise();
    const workerPool = serverFixture.server.services.verification["workerPool"];
    const originalRun = workerPool.run;
    const runTaskStub = sandbox
      .stub(workerPool, "run")
      .callsFake(async (...args) => {
        await fakePromise;
        return originalRun.apply(workerPool, args);
      }) as sinon.SinonStub<[any, any], Promise<any>>;

    const resolveWorkers = async () => {
      if (fakePromise.status === "pending") {
        // Start workers
        fakePromise.resolve(undefined);
      }
      // Wait for workers to complete
      await Promise.all(
        serverFixture.server.services.verification["runningTasks"],
      );
    };
    fakeResolvers.push(resolveWorkers);
    return { resolveWorkers, runTaskStub };
  };

  return makeWorkersWait;
}
