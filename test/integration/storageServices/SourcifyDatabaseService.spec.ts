import { use, expect } from "chai";
import { StoreService } from "../../../services/store/StoreService";
import chaiAsPromised from "chai-as-promised";
import { MockVerificationExport } from "../../helpers/mocks";
import { resetDatabase } from "../../helpers/helpers";
import sinon from "sinon";
import { ConflictError } from "../../../common/errors";

use(chaiAsPromised);

describe("SourcifyDatabaseService", function () {
  let databaseService: StoreService;
  const sandbox = sinon.createSandbox();

  before(async () => {
    databaseService = new StoreService(
      {
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: parseInt(process.env.MYSQL_PORT || "3306"),
        username: process.env.MYSQL_USERNAME || "root",
        password: process.env.MYSQL_PASSWORD || "root",
        database: process.env.MYSQL_DATABASE || "verification",
        dialect: "mysql",
        syncSchema: true,
        readonly: false,
        logging: false,
      },
    );
    await databaseService.init();
  });

  this.beforeEach(async () => {
    await resetDatabase(databaseService.database.pool);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should throw an error if no verified_contracts row can be inserted for a verification update", async () => {
    const nonePerfectVerification = structuredClone(MockVerificationExport);
    nonePerfectVerification.status.creationMatch = "partial";

    await databaseService.init();
    await databaseService.storeVerification(nonePerfectVerification);

    // We cannot use to.eventually.be.rejectedWith because ConflictError doesn't extend Error directly
    let thrownError: unknown;
    try {
      await databaseService.storeVerification(MockVerificationExport);
      expect.fail("Expected storeVerification to throw");
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).to.be.instanceOf(ConflictError);
    expect((thrownError as ConflictError).statusCode).to.equal(409);
    expect((thrownError as ConflictError).message).to.equal(
      "A verified contract already exist for your compilation and deployment",
    );
  });

  /*it("should store signatures correctly when storeVerification is called", async () => {
    await databaseService.storeVerification(MockVerificationExport);

    const signaturesResult: Tables.ISignatures[] =
      await databaseService.database.pool.query("SELECT * FROM signatures", {
        type: QueryTypes.SELECT,
      });

    expect(signaturesResult?.length).to.equal(2);

    const signatures = signaturesResult;
    const retrieveSignature = signatures.find(
      (s) => s.signature === "retrieve()",
    );
    const storeSignature = signatures.find(
      (s) => s.signature === "store(uint256)",
    );

    expect(retrieveSignature).to.exist;
    expect(storeSignature).to.exist;

    const expectedRetrieveSignatureHash32 = bytesFromString(
      keccak256str("retrieve()"),
    );
    const expectedStoreSignatureHash32 = bytesFromString(
      keccak256str("store(uint256)"),
    );

    expect(retrieveSignature!.signature_hash_32).to.be.instanceOf(Buffer);
    expect(retrieveSignature!.signature_hash_32.length).to.equal(32);
    expect(
      retrieveSignature!.signature_hash_32.equals(
        expectedRetrieveSignatureHash32,
      ),
    ).to.be.true;
    expect(retrieveSignature!.signature_hash_4).to.be.instanceOf(Buffer);
    expect(retrieveSignature!.signature_hash_4.length).to.equal(4);
    expect(retrieveSignature!.signature_hash_4).to.deep.equal(
      expectedRetrieveSignatureHash32.subarray(0, 4),
    );

    expect(storeSignature!.signature_hash_32).to.be.instanceOf(Buffer);
    expect(storeSignature!.signature_hash_32.length).to.equal(32);
    expect(
      storeSignature!.signature_hash_32.equals(expectedStoreSignatureHash32),
    ).to.be.true;
    expect(storeSignature!.signature_hash_4).to.be.instanceOf(Buffer);
    expect(storeSignature!.signature_hash_4.length).to.equal(4);
    expect(storeSignature!.signature_hash_4).to.deep.equal(
      expectedStoreSignatureHash32.subarray(0, 4),
    );

    const compiledContractSignaturesResult: Tables.ICompiledContractsSignatures[] =
      await databaseService.database.pool.query(
        "SELECT * FROM compiled_contracts_signatures",{
          type: QueryTypes.SELECT,
      });

    expect(compiledContractSignaturesResult?.length).to.equal(2);

    const contractSignatures = compiledContractSignaturesResult;
    const compiledContractRetrieveSig =
      compiledContractSignaturesResult.find((csig) =>
        csig.signature_hash_32.equals(expectedRetrieveSignatureHash32),
      );
    const compiledContractStoreSig = contractSignatures.find((csig) =>
      csig.signature_hash_32.equals(expectedStoreSignatureHash32),
    );

    expect(compiledContractRetrieveSig).to.exist;
    expect(compiledContractStoreSig).to.exist;
    expect(compiledContractRetrieveSig!.compilation_id).to.equal(
      compiledContractStoreSig!.compilation_id,
    );
    expect(compiledContractRetrieveSig!.signature_type).to.equal("function");
    expect(compiledContractStoreSig!.signature_type).to.equal("function");
  });

  it("should handle duplicate signature storage gracefully", async () => {
    // Change mock to be able to store the verification twice
    const modifiedVerification = structuredClone(MockVerificationExport);
    modifiedVerification.status.creationMatch = "partial";
    modifiedVerification.compilation.language = "Vyper";

    await databaseService.storeVerification(modifiedVerification);
    await expect(databaseService.storeVerification(MockVerificationExport)).to
      .not.be.rejected;

    const signaturesResult: any[] = await databaseService.database.pool.query(
      "SELECT COUNT(*) as count FROM signatures",{
        type: QueryTypes.SELECT,
    });
    expect(parseInt(signaturesResult[0]["count"])).to.equal(2);
  });

  it("should still store verification even if signature storage fails", async () => {
    sandbox
      .stub(signatureUtil, "extractSignaturesFromAbi")
      .throws(new Error("Simulated signature extraction error"));

    await expect(databaseService.storeVerification(MockVerificationExport)).to
      .not.be.rejected;

    const verifiedContractsResult: any[] = await databaseService.database.pool.query(
      "SELECT COUNT(*) as count FROM verified_contracts",{
        type: QueryTypes.SELECT,
    });
    expect(parseInt(verifiedContractsResult[0]["count"])).to.equal(1);

    const signaturesResult: any[] = await databaseService.database.pool.query(
      "SELECT COUNT(*) as count FROM signatures",{
        type: QueryTypes.SELECT,
    });
    expect(parseInt(signaturesResult[0]["count"])).to.equal(0);

    const contractSignaturesResult: any[] = await databaseService.database.pool.query(
      "SELECT COUNT(*) as count FROM compiled_contracts_signatures",{
        type: QueryTypes.SELECT,
    });
    expect(parseInt(contractSignaturesResult[0]["count"])).to.equal(0);
  });*/
});
