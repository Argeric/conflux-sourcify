import fs from "fs";
import nock from "nock";
import path from "path";
import rimraf from "rimraf";
import { VerificationService } from "../../services/verification/VerificationService";
import { Chain } from "../../services/chain/Chain";
import { ChainMap } from "../../server";
import { StoreService } from "../../services/store/StoreService";
import { expect } from "chai";
import { findSolcPlatform } from "@ethereum-sourcify/compilers";
import { loadConfig } from "../../config/Loader";
import sinon from "sinon";
import { ConfluxscanResult } from "../../services/utils/confluxscan-util";

describe("VerificationService", function() {
  const sandbox = sinon.createSandbox();

  beforeEach(function() {
    // Clear any previously nocked interceptors
    nock.cleanAll();
  });

  afterEach(function() {
    // Ensure that all nock interceptors have been used
    nock.isDone();
  });

  function createMockStorageService(testVerificationId: string) {
    const mockStorageService = {
      storeVerificationJob: () => {
        console.log(`call storeVerificationJob ===`)
      },
      setJobError: () => {
        console.log(`call setJobError ===`)
      }
    } as any;

    sinon.stub(mockStorageService, 'storeVerificationJob').resolves(testVerificationId);
    sinon.stub(mockStorageService, 'setJobError').resolves();

    return mockStorageService;
  }

  function mockWorkerPoolError(verificationService: VerificationService) {
    const workerPoolStub = sandbox.stub(
      verificationService["workerPool"],
      "run"
    );
    workerPoolStub.rejects(new Error("Worker pool error"));
    return workerPoolStub;
  }

  it("should initialize compilers", async function() {
    const config = loadConfig();
    const chainMap: ChainMap = {};
    for (const chainObj of Object.values(config.chains)) {
      chainMap[chainObj.chainId.toString()] = new Chain(chainObj);
    }

    rimraf.sync(config.solc.solcBinRepo);
    rimraf.sync(config.solc.solcJsRepo);

    const platform = findSolcPlatform() || "bin";
    const HOST_SOLC_REPO = "https://binaries.soliditylang.org";

    // Mock the list of solc versions to not download every single
    let releases: Record<string, string>;
    if (platform === "bin") {
      releases = {
        "0.8.26": "soljson-v0.8.26+commit.8a97fa7a.js",
        "0.6.12": "soljson-v0.6.12+commit.27d51765.js"
      };
      nock(HOST_SOLC_REPO, { allowUnmocked: true })
        .get("/bin/list.json")
        .reply(200, {
          releases
        });
    } else if (platform === "macosx-amd64") {
      releases = {
        "0.8.26": "solc-macosx-amd64-v0.8.26+commit.8a97fa7a",
        "0.6.12": "solc-macosx-amd64-v0.6.12+commit.27d51765",
        "0.4.10": "solc-macosx-amd64-v0.4.10+commit.f0d539ae"
      };
      nock(HOST_SOLC_REPO, { allowUnmocked: true })
        .get("/macosx-amd64/list.json")
        .reply(200, {
          releases
        });
    } else {
      releases = {
        "0.8.26": "solc-linux-amd64-v0.8.26+commit.8a97fa7a",
        "0.6.12": "solc-linux-amd64-v0.6.12+commit.27d51765",
        "0.4.10": "solc-linux-amd64-v0.4.10+commit.9e8cc01b"
      };
      nock(HOST_SOLC_REPO, { allowUnmocked: true })
        .get("/linux-amd64/list.json")
        .reply(200, {
          releases
        });
    }

    const verificationService = new VerificationService(
      {
        initCompilers: true,
        chains: chainMap,
        solcRepoPath: config.solc.solcBinRepo,
        solJsonRepoPath: config.solc.solcJsRepo,
        vyperRepoPath: config.vyper.vyperRepo,
        feRepoPath: config.fe.feRepo,
        workerIdleTimeout: 3000,
        concurrentVerificationsPerWorker: 1
      },
      new StoreService(config.mysql)
    );

    // Call the init method to trigger the download
    await verificationService.init();

    // Check if the files exist in the expected directory
    const downloadDir =
      platform === "bin" ? config.solc.solcJsRepo : config.solc.solcBinRepo;

    Object.values(releases).forEach((release) => {
      expect(fs.existsSync(path.join(downloadDir, release))).to.be.true;
    });
  });

  it("should handle workerPool.run errors and set job error as internal_error", async function() {
    const verificationId = "test-verification-id";
    const mockStorageService = createMockStorageService(verificationId);

    const config = loadConfig();
    const chainMap: ChainMap = {};
    for (const chainObj of Object.values(config.chains)) {
      chainMap[chainObj.chainId.toString()] = new Chain(chainObj);
    }
    const verificationService = new VerificationService(
      {
        initCompilers: true,
        chains: chainMap,
        solcRepoPath: config.solc.solcBinRepo,
        solJsonRepoPath: config.solc.solcJsRepo,
        vyperRepoPath: config.vyper.vyperRepo,
        feRepoPath: config.fe.feRepo,
        workerIdleTimeout: 3000,
        concurrentVerificationsPerWorker: 1
      },
      mockStorageService
    );

    mockWorkerPoolError(verificationService);

    const mockConfluxscanResult: ConfluxscanResult = {
      ContractName: "TestContract",
      SourceCode: "contract TestContract {}",
      ABI: "[]",
      CompilerVersion: "v0.8.26+commit.8a97fa7a",
      OptimizationUsed: "0",
      Runs: "200",
      ConstructorArguments: "",
      EVMVersion: "default",
      Library: "",
      LicenseType: "",
      Proxy: "0",
      Implementation: "",
      SwarmSource: ""
    };

    // Call the method that should handle worker errors
    verificationService.verifyFromConfluxscanViaWorker(
      "test-endpoint",
      1,
      "0x1234567890123456789012345678901234567890",
      mockConfluxscanResult
    );

    // Wait for the async task to complete
    await new Promise((resolve) => setTimeout(resolve, 1));

    // Verify the job error was set with internal_error
    expect(mockStorageService.setJobError.calledOnce).to.equal(true);

    // The setJobError call has args: ["setJobError", [verificationId, Date, errorExport]]
    const args = mockStorageService.setJobError.getCall(0).args;
    expect(args[0]).to.equal(verificationId);
    expect(args[1]).to.be.instanceOf(Date);
    expect(args[2]).to.deep.include({
      customCode: "internal_error"
    });
    expect(args[2].errorId).to.be.a("string");
  });
});
