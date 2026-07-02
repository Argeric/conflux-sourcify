import chai from "chai";
import chaiHttp from "chai-http";
import { deployFromAbiAndBytecodeForCreatorTxHash, hookIntoVerificationWorkerRun } from "../../../helpers/helpers";
import { LocalChainFixture } from "../../../helpers/LocalChainFixture";
import { ServerFixture } from "../../../helpers/ServerFixture";
import path from "path";
import fs from "fs";
import { assertJobVerification } from "../../../helpers/assertions";
import sinon from "sinon";
import { testAlreadyBeingVerified, testAlreadyVerified } from "../../../helpers/common-tests";
import { QueryTypes } from "sequelize";

chai.use(chaiHttp);

describe("POST /verify/:chainId/:address", function () {
  const chainFixture = new LocalChainFixture();
  const serverFixture = new ServerFixture();
  const sandbox = sinon.createSandbox();
  const makeWorkersWait = hookIntoVerificationWorkerRun(sandbox, serverFixture);

  afterEach(async () => {
    sandbox.restore();
  });

  it("should verify a contract with Solidity standard input JSON", async () => {
    const { resolveWorkers } = makeWorkersWait();

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: chainFixture.defaultContractJsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    await assertJobVerification(
      serverFixture,
      verifyRes,
      resolveWorkers,
      chainFixture.chainId,
      chainFixture.defaultContractAddress,
      "exact_match",
    );
  });

  it("should verify a Vyper contract", async () => {
    const { resolveWorkers } = makeWorkersWait();

    const vyperContractPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "sources",
      "vyper",
      "testcontract",
    );
    const vyperArtifactPath = path.join(vyperContractPath, "artifact.json");
    const vyperArtifact = JSON.parse(
      fs.readFileSync(vyperArtifactPath, "utf8"),
    );
    const vyperSourceFileName = "test.vy";
    const vyperSourcePath = path.join(vyperContractPath, vyperSourceFileName);
    const vyperSource = fs.readFileSync(vyperSourcePath, "utf8");

    const { contractAddress, txHash } =
      await deployFromAbiAndBytecodeForCreatorTxHash(
        chainFixture.localSigner,
        vyperArtifact.abi,
        vyperArtifact.bytecode,
      );

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(`/verify/${chainFixture.chainId}/${contractAddress}`)
      .send({
        stdJsonInput: {
          language: "Vyper",
          sources: {
            [vyperSourceFileName]: {
              content: vyperSource,
            },
          },
          settings: {
            evmVersion: "istanbul",
            outputSelection: {
              "*": ["evm.bytecode"],
            },
          },
        },
        compilerVersion: "0.3.10+commit.91361694",
        contractIdentifier: `${vyperSourceFileName}:${vyperSourceFileName.split(".")[0]}`,
        creationTransactionHash: txHash,
      });

    await assertJobVerification(
      serverFixture,
      verifyRes,
      resolveWorkers,
      chainFixture.chainId,
      contractAddress,
      "match",
      false,
    );
  });

  it("should verify a Yul contract", async () => {
    const { resolveWorkers } = makeWorkersWait();

    const yulContractPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "sources",
      "yul",
      "cas-forwarder",
    );
    const yulArtifact = JSON.parse(
      fs.readFileSync(path.join(yulContractPath, "artifact.json"), "utf8"),
    );
    const jsonInput = JSON.parse(
      fs.readFileSync(path.join(yulContractPath, "jsonInput.json"), "utf8"),
    );
    const sourceFileName = "cas-forwarder.yul";
    const contractIdentifier = `${sourceFileName}:cas-forwarder`;

    const { contractAddress, txHash } =
      await deployFromAbiAndBytecodeForCreatorTxHash(
        chainFixture.localSigner,
        yulArtifact.abi,
        yulArtifact.bytecode,
      );

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(`/verify/${chainFixture.chainId}/${contractAddress}`)
      .send({
        stdJsonInput: jsonInput,
        compilerVersion: "0.8.26+commit.8a97fa7a",
        contractIdentifier,
        creationTransactionHash: txHash,
      });

    await assertJobVerification(
      serverFixture,
      verifyRes,
      resolveWorkers,
      chainFixture.chainId,
      contractAddress,
      "match",
      false,
    );
  });

  it("should fetch the creation transaction hash if not provided", async () => {
    const { resolveWorkers } = makeWorkersWait();

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: chainFixture.defaultContractJsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
      });

    await assertJobVerification(
      serverFixture,
      verifyRes,
      resolveWorkers,
      chainFixture.chainId,
      chainFixture.defaultContractAddress,
      "exact_match",
    );
  });

  it("should store a job error if the compiler returns an error", async () => {
    const { resolveWorkers } = makeWorkersWait();

    const sourcePath = Object.keys(
      chainFixture.defaultContractMetadataObject.settings.compilationTarget,
    )[0];
    const jsonInput = JSON.parse(
      JSON.stringify(chainFixture.defaultContractJsonInput),
    );
    // Introduce a syntax error in the source code
    jsonInput.sources[sourcePath].content = jsonInput.sources[
      sourcePath
    ].content.replace("contract", "contrat");

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: jsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(202);

    await resolveWorkers();

    const jobRes = await chai
      .request(serverFixture.server.app)
      .get(`/verify/${verifyRes.body.verificationId}`);

    chai.expect(jobRes.status).to.equal(200);
    chai.expect(jobRes.body).to.include({
      isJobCompleted: true,
    });
    chai.expect(jobRes.body.error).to.exist;
    chai.expect(jobRes.body.error.customCode).to.equal("compiler_error");
    chai.expect(jobRes.body.contract).to.deep.equal({
      match: null,
      creationMatch: null,
      runtimeMatch: null,
      chainId: chainFixture.chainId,
      address: chainFixture.defaultContractAddress,
    });
  });

  it("should return a 429 if the contract is being verified at the moment already", async () => {
    await testAlreadyBeingVerified(
      serverFixture,
      makeWorkersWait,
      `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      {
        stdJsonInput: chainFixture.defaultContractJsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      },
    );
  });

  it("should return a 409 if the contract is already verified", async () => {
    await testAlreadyVerified(
      serverFixture,
      makeWorkersWait,
      `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      {
        stdJsonInput: chainFixture.defaultContractJsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      },
      chainFixture.chainId,
      chainFixture.defaultContractAddress,
    );
  });

  it("should return a 400 if the standard json input misses the language", async () => {
    const jsonInput = JSON.parse(
      JSON.stringify(chainFixture.defaultContractJsonInput),
    );
    delete jsonInput.language;

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: jsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(400);
    chai.expect(verifyRes.body.customCode).to.equal("invalid_parameter");
    chai.expect(verifyRes.body).to.have.property("errorId");
    chai.expect(verifyRes.body).to.have.property("message");
  });

  it("should return a 400 if the standard json input misses the sources field", async () => {
    const jsonInput = JSON.parse(
      JSON.stringify(chainFixture.defaultContractJsonInput),
    );
    delete jsonInput.sources;

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: jsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(400);
    chai.expect(verifyRes.body.customCode).to.equal("invalid_parameter");
    chai.expect(verifyRes.body).to.have.property("errorId");
    chai.expect(verifyRes.body).to.have.property("message");
  });

  it("should return a 400 if the standard json input misses the content field for any source", async () => {
    const sourcePath = Object.keys(
      chainFixture.defaultContractMetadataObject.settings.compilationTarget,
    )[0];
    const jsonInput = JSON.parse(
      JSON.stringify(chainFixture.defaultContractJsonInput),
    );
    delete jsonInput.sources[sourcePath].content;

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: jsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(400);
    chai.expect(verifyRes.body.customCode).to.equal("invalid_parameter");
    chai.expect(verifyRes.body).to.have.property("errorId");
    chai.expect(verifyRes.body).to.have.property("message");
  });

  it("should return 400 when contract identifier is missing", async () => {
    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: chainFixture.defaultContractJsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(400);
    chai.expect(verifyRes.body.customCode).to.equal("invalid_parameter");
    chai.expect(verifyRes.body).to.have.property("errorId");
    chai.expect(verifyRes.body).to.have.property("message");
  });

  it("should return 400 when compiler version is missing", async () => {
    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        stdJsonInput: chainFixture.defaultContractJsonInput,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(400);
    chai.expect(verifyRes.body.customCode).to.equal("invalid_parameter");
    chai.expect(verifyRes.body).to.have.property("errorId");
    chai.expect(verifyRes.body).to.have.property("message");
  });

  it("should return 400 when standard JSON input is missing", async () => {
    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(
        `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
      )
      .send({
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(400);
    chai.expect(verifyRes.body.customCode).to.equal("invalid_parameter");
    chai.expect(verifyRes.body).to.have.property("errorId");
    chai.expect(verifyRes.body).to.have.property("message");
  });

  it("should return a 400 when the chain is not found", async function () {
    const unknownChainId = chainFixture.chainId;
    const chainMap = serverFixture.server.chains;
    sandbox.stub(chainMap, unknownChainId).value(undefined);

    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(`/verify/${unknownChainId}/${chainFixture.defaultContractAddress}`)
      .send({
        stdJsonInput: chainFixture.defaultContractJsonInput,
        compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: chainFixture.defaultContractCreatorTx,
      });

    chai.expect(verifyRes.status).to.equal(400);
    chai.expect(verifyRes.body.customCode).to.equal("unsupported_chain");
    chai.expect(verifyRes.body).to.have.property("errorId");
    chai.expect(verifyRes.body).to.have.property("message");
  });

  it("should fail matching with creation tx if the provided creationTransactionHash does not match the contract address", async () => {
    // Deploy contract A
    const deploymentA = await deployFromAbiAndBytecodeForCreatorTxHash(
      chainFixture.localSigner,
      chainFixture.defaultContractArtifact.abi,
      chainFixture.defaultContractArtifact.bytecode,
    );

    // Deploy contract B
    const deploymentB = await deployFromAbiAndBytecodeForCreatorTxHash(
      chainFixture.localSigner,
      chainFixture.defaultContractArtifact.abi,
      chainFixture.defaultContractArtifact.bytecode,
    );

    const { resolveWorkers } = makeWorkersWait();

    // Try to verify contract A, but provide B's creatorTxHash
    const verifyRes = await chai
      .request(serverFixture.server.app)
      .post(`/verify/${chainFixture.chainId}/${deploymentA.contractAddress}`)
      .send({
        stdJsonInput: chainFixture.defaultContractJsonInput,
        compilerVersion:
        chainFixture.defaultContractMetadataObject.compiler.version,
        contractIdentifier: Object.entries(
          chainFixture.defaultContractMetadataObject.settings.compilationTarget,
        )[0].join(":"),
        creationTransactionHash: deploymentB.txHash,
      });

    await resolveWorkers();

    // Fetch the job result
    const jobRes = await chai
      .request(serverFixture.server.app)
      .get(`/verify/${verifyRes.body.verificationId}`);

    chai.expect(jobRes.status).to.be.oneOf([200]);
    chai.expect(jobRes.body).to.include({
      isJobCompleted: true,
    });
    chai.expect(jobRes.body.error).to.not.exist;
    chai.expect(jobRes.body.contract.creationMatch).to.be.null;
    chai.expect(jobRes.body.contract.runtimeMatch).to.equal("exact_match");
  });

  describe("match upgrades", function () {
    it("should upgrade creation match from null to exact_match when re-verified with correct creationTransactionHash", async () => {
      const fakeTxHash =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

      const { resolveWorkers, runTaskStub } = makeWorkersWait();

      // First verification with wrong creationTransactionHash - creation match will be null
      const verifyRes1 = await chai
        .request(serverFixture.server.app)
        .post(
          `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
        )
        .send({
          stdJsonInput: chainFixture.defaultContractJsonInput,
          compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
          contractIdentifier: Object.entries(
            chainFixture.defaultContractMetadataObject.settings
              .compilationTarget,
          )[0].join(":"),
          creationTransactionHash: fakeTxHash,
        });

      chai.expect(verifyRes1.status).to.equal(202);
      await resolveWorkers();

      // Check first verification result
      const jobRes1 = await chai
        .request(serverFixture.server.app)
        .get(`/verify/${verifyRes1.body.verificationId}`);
      chai.expect(jobRes1.status).to.equal(200);
      chai.expect(jobRes1.body.isJobCompleted).to.be.true;
      chai.expect(jobRes1.body.contract.runtimeMatch).to.equal("exact_match");
      chai.expect(jobRes1.body.contract.creationMatch).to.be.null;

      // Check database: creation_match should be false
      const verifiedContractsResult1: any[] =
        await serverFixture.sourcifyDatabase.query(
          "SELECT creation_match FROM verified_contracts",
          {
            type: QueryTypes.SELECT
          }
        );
      chai.expect(verifiedContractsResult1).to.have.length(1);
      chai.expect(verifiedContractsResult1[0].creation_match).to.equals(0);

      // Check contract_deployments: should have no transaction_hash
      const contractDeployment1: any[] = await serverFixture.sourcifyDatabase.query(
        "SELECT transaction_hash, block_number, transaction_index FROM contract_deployments",
        {type: QueryTypes.SELECT}
      );
      chai.expect(contractDeployment1).to.have.length(1);
      chai.expect(contractDeployment1[0].transaction_hash).to.be.null;
      chai.expect(contractDeployment1[0].block_number).to.be.null;
      chai.expect(contractDeployment1[0].transaction_index).to.be.null;

      // Re-verify with correct creationTransactionHash to upgrade
      runTaskStub.restore();
      const { resolveWorkers: resolveWorkers2 } = makeWorkersWait();

      const verifyRes2 = await chai
        .request(serverFixture.server.app)
        .post(
          `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
        )
        .send({
          stdJsonInput: chainFixture.defaultContractJsonInput,
          compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
          contractIdentifier: Object.entries(
            chainFixture.defaultContractMetadataObject.settings
              .compilationTarget,
          )[0].join(":"),
          creationTransactionHash: chainFixture.defaultContractCreatorTx,
        });

      chai.expect(verifyRes2.status).to.equal(202);
      await resolveWorkers2();

      const jobRes2 = await chai
        .request(serverFixture.server.app)
        .get(`/verify/${verifyRes2.body.verificationId}`);

      chai.expect(jobRes2.status).to.equal(200);
      chai.expect(jobRes2.body.isJobCompleted).to.be.true;
      chai.expect(jobRes2.body.contract.runtimeMatch).to.equal("exact_match");
      chai.expect(jobRes2.body.contract.creationMatch).to.equal("exact_match");

      // Check database: should have two verified_contracts entries
      const verifiedContractsResult2: any[] =
        await serverFixture.sourcifyDatabase.query(
          "SELECT creation_match FROM verified_contracts ORDER BY id DESC",
          {
            type: QueryTypes.SELECT
          }
        );
      /*chai.expect(verifiedContractsResult2).to.have.length(2);
      chai.expect(verifiedContractsResult2[0].creation_match).to.equals(1);
      chai.expect(verifiedContractsResult2[1].creation_match).to.equals(0);*/
      chai.expect(verifiedContractsResult2).to.have.length(1);
      chai.expect(verifiedContractsResult2[0].creation_match).to.equals(1);

      // Check contract_deployments: new entry should have correct transaction info
      const contractDeployment2: any[] = await serverFixture.sourcifyDatabase.query(
        "SELECT transaction_hash, block_number, transaction_index, contract_id FROM contract_deployments ORDER BY createdAt DESC LIMIT 1",
        {
          type: QueryTypes.SELECT
        }
      );
      chai
        .expect(contractDeployment2[0].transaction_hash)
        .to.equal(chainFixture.defaultContractCreatorTx);
    });


    async function testPartialUpgrade(matchType: "creation" | "runtime") {
      // Build a modified standard JSON input that produces a partial match
      const modifiedJsonInput = JSON.parse(
        JSON.stringify(chainFixture.defaultContractJsonInput),
      );
      modifiedJsonInput.sources = {
        "contracts/StorageModified.sol": {
          content: chainFixture.defaultContractModifiedSource.toString(),
        },
      };

      // Step 1: Create a partial match with modified sources
      const { resolveWorkers: resolveWorkers1, runTaskStub: runTaskStub1 } =
        makeWorkersWait();

      const verifyRes1 = await chai
        .request(serverFixture.server.app)
        .post(
          `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
        )
        .send({
          stdJsonInput: modifiedJsonInput,
          compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
          contractIdentifier: "contracts/StorageModified.sol:StorageModified",
          creationTransactionHash: chainFixture.defaultContractCreatorTx,
        });

      chai.expect(verifyRes1.status).to.equal(202);
      await resolveWorkers1();

      // Verify partial match
      const jobRes1 = await chai
        .request(serverFixture.server.app)
        .get(`/verify/${verifyRes1.body.verificationId}`);

      chai.expect(jobRes1.body.isJobCompleted).to.be.true;
      chai.expect(jobRes1.body.error).to.be.undefined;
      chai.expect(jobRes1.body.contract.runtimeMatch).to.equal("match");
      chai.expect(jobRes1.body.contract.creationMatch).to.equal("match");

      // Confirm DB state
      const contractMatchesPartial: any[] = await serverFixture.sourcifyDatabase.query(
        "SELECT runtime_match, creation_match FROM sourcify_matches",
        {
          type: QueryTypes.SELECT
        }
      );
      chai
        .expect(contractMatchesPartial[0].runtime_match)
        .to.equal("partial");
      chai
        .expect(contractMatchesPartial[0].creation_match)
        .to.equal("partial");

      // Save contract_id for later comparison
      const contractDeploymentAfterPartial: any[] =
        await serverFixture.sourcifyDatabase.query(
          "SELECT contract_id FROM contract_deployments",
          {
            type: QueryTypes.SELECT
          }
        );
      chai.expect(contractDeploymentAfterPartial).to.have.length(1);
      const contractIdAfterPartial =
        contractDeploymentAfterPartial[0].contract_id;

      // Step 2: Force one match to "perfect" in DB
      await serverFixture.sourcifyDatabase.query(
        `UPDATE sourcify_matches SET ${matchType}_match='perfect' WHERE 1=1`,
        {
          type: QueryTypes.UPDATE
        }
      );

      // Step 3: Re-verify with original sources to upgrade the remaining partial match
      runTaskStub1.restore();
      const { resolveWorkers: resolveWorkers2 } = makeWorkersWait();

      const verifyRes2 = await chai
        .request(serverFixture.server.app)
        .post(
          `/verify/${chainFixture.chainId}/${chainFixture.defaultContractAddress}`,
        )
        .send({
          stdJsonInput: chainFixture.defaultContractJsonInput,
          compilerVersion:
          chainFixture.defaultContractMetadataObject.compiler.version,
          contractIdentifier: Object.entries(
            chainFixture.defaultContractMetadataObject.settings
              .compilationTarget,
          )[0].join(":"),
          creationTransactionHash: chainFixture.defaultContractCreatorTx,
        });

      await assertJobVerification(
        serverFixture,
        verifyRes2,
        resolveWorkers2,
        chainFixture.chainId,
        chainFixture.defaultContractAddress,
        "exact_match",
      );

      // Verify both matches are now "perfect" in DB
      const contractMatchesPerfect: any[] = await serverFixture.sourcifyDatabase.query(
        "SELECT runtime_match, creation_match FROM sourcify_matches",
        {
          type: QueryTypes.SELECT
        }
      );
      chai
        .expect(contractMatchesPerfect[0].runtime_match)
        .to.equal("perfect");
      chai
        .expect(contractMatchesPerfect[0].creation_match)
        .to.equal("perfect");

      // contract_id should not have changed (same deployment, just upgraded match)
      const contractDeploymentAfterUpgrade: any[] =
        await serverFixture.sourcifyDatabase.query(
          "SELECT contract_id FROM contract_deployments",
          {
            type: QueryTypes.SELECT
          }
        );
      chai.expect(contractDeploymentAfterUpgrade).to.have.length(1);
      chai
        .expect(contractDeploymentAfterUpgrade[0].contract_id)
        .to.equal(contractIdAfterPartial);

      // Should have two compiled_contracts_sources entries (partial + perfect)
      const sourcesResult: any[] = await serverFixture.sourcifyDatabase.query(
        "SELECT source_hash FROM compiled_contracts_sources",
        {
          type: QueryTypes.SELECT
        }
      );
      chai.expect(sourcesResult).to.have.length(2);
    }

    it("should upgrade creation match from match to exact_match even if runtime match is already exact_match", async () => {
      await testPartialUpgrade("runtime");
    });

    it("should upgrade runtime match from match to exact_match even if creation match is already exact_match", async () => {
      await testPartialUpgrade("creation");
    });
  });
});
