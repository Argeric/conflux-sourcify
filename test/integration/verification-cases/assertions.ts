import chai from "chai";
import { keccak256 } from "ethers";
import type { ServerFixture } from "../../helpers/ServerFixture";
import {
  getCompilerNameFromLanguage,
} from "../../../services/utils/database-util";
import { splitFullyQualifiedName } from "@ethereum-sourcify/lib-sourcify";
import {
  getTotalMatchLevel,
  toVerificationStatus,
} from "../../../services/utils/util";
import type { VerificationTestCase } from "./verification-cases.spec";
import type { DeploymentInfo } from "../../helpers/helpers";
import { QueryTypes } from "sequelize";

export async function assertDatabase(
  serverFixture: ServerFixture,
  testCase: VerificationTestCase,
  chainId: number,
  deployerAddress: string,
  deploymentInfo: DeploymentInfo,
) {
  if (!serverFixture.sourcifyDatabase) {
    chai.assert.fail("No database on StorageService");
  }
  const res = await serverFixture.sourcifyDatabase.query(
    `SELECT
          vc.creation_match,
          vc.creation_values,
          vc.creation_transformations,
          vc.creation_metadata_match,
          vc.runtime_match,
          vc.runtime_values,
          vc.runtime_transformations,
          vc.runtime_metadata_match,
          sm.creation_match as sourcify_creation_match,
          sm.runtime_match as sourcify_runtime_match,
          sm.metadata,
          nullif(CONVERT(compiled_runtime_code.code USING utf8), '0x') as compiled_runtime_code,
          nullif(CONVERT(compiled_creation_code.code USING utf8), '0x') as compiled_creation_code,
          compiled_runtime_code.code_hash as compiled_runtime_code_hash,
          compiled_creation_code.code_hash as compiled_creation_code_hash,
          compiled_runtime_code.code_hash_keccak as compiled_runtime_code_hash_keccak,
          compiled_creation_code.code_hash_keccak as compiled_creation_code_hash_keccak,
          nullif(CONVERT(onchain_runtime_code.code USING utf8), '0x') as onchain_runtime_code,
          nullif(CONVERT(onchain_creation_code.code USING utf8), '0x') as onchain_creation_code,
          onchain_runtime_code.code_hash as onchain_runtime_code_hash,
          onchain_creation_code.code_hash as onchain_creation_code_hash,
          onchain_runtime_code.code_hash_keccak as onchain_runtime_code_hash_keccak,
          onchain_creation_code.code_hash_keccak as onchain_creation_code_hash_keccak,
          cc.compiler,
          cc.version,
          cc.language,
          cc.name,
          cc.fully_qualified_name,
          cc.compiler_settings,
          cc.compilation_artifacts,
          cc.creation_code_artifacts,
          cc.runtime_code_artifacts,
          cc.additional_input,
          cd.chain_id,
          cd.address,
          cd.transaction_hash,
          cd.block_number,
          cd.transaction_index,
          cd.deployer
        FROM verified_contracts vc
        JOIN sourcify_matches sm ON sm.verified_contract_id = vc.id
        LEFT JOIN contract_deployments cd ON cd.id = vc.deployment_id
        LEFT JOIN contracts c ON c.id = cd.contract_id
        LEFT JOIN compiled_contracts cc ON cc.id = vc.compilation_id
        LEFT JOIN code compiled_runtime_code ON compiled_runtime_code.code_hash = cc.runtime_code_hash
        LEFT JOIN code compiled_creation_code ON compiled_creation_code.code_hash = cc.creation_code_hash
        LEFT JOIN code onchain_runtime_code ON onchain_runtime_code.code_hash = c.runtime_code_hash
        LEFT JOIN code onchain_creation_code ON onchain_creation_code.code_hash = c.creation_code_hash
        where cd.address = ?`,
    {
      type: QueryTypes.SELECT,
      replacements: [deploymentInfo.contractAddress],
    },
  );
  const resSources = await serverFixture.sourcifyDatabase.query(
    `SELECT
          ccs.*,
          s.source_hash, CONVERT(s.content USING utf8mb4) as content
        FROM verified_contracts vc
        LEFT JOIN contract_deployments cd ON cd.id = vc.deployment_id
        LEFT JOIN compiled_contracts cc ON cc.id = vc.compilation_id
        LEFT JOIN compiled_contracts_sources ccs on ccs.compilation_id = cc.id
        LEFT JOIN sources s ON s.source_hash = ccs.source_hash
        where cd.address = ?`,
    {
      type: QueryTypes.SELECT,
      replacements: [deploymentInfo.contractAddress],
    },
  );
  chai.expect(res.length).to.equal(1);

  const row: any = res[0];

  // compiled_contracts columns
  const { contractName } = splitFullyQualifiedName(
    testCase.input.contractIdentifier,
  );
  chai
    .expect(row.compiler)
    .to.equal(
      getCompilerNameFromLanguage(testCase.input.stdJsonInput.language),
    );
  chai.expect(row.version).to.equal(testCase.input.compilerVersion);
  chai
    .expect(row.language)
    .to.equal(testCase.input.stdJsonInput.language.toLowerCase());
  chai.expect(row.name).to.equal(contractName);
  chai
    .expect(row.fully_qualified_name)
    .to.equal(testCase.input.contractIdentifier);
  chai
    .expect(row.compiler_settings)
    .to.deep.equal(testCase.input.stdJsonInput.settings);
  chai
    .expect(row.compilation_artifacts)
    .to.deep.equal(testCase.output.compilationArtifacts);
  chai
    .expect(row.creation_code_artifacts)
    .to.deep.equal(testCase.output.creationCodeArtifacts);
  chai
    .expect(row.runtime_code_artifacts)
    .to.deep.equal(testCase.output.runtimeCodeArtifacts);

  // additional_input column (e.g. Vyper storage_layout_overrides)
  const expectedAdditionalInput =
    "storage_layout_overrides" in testCase.input.stdJsonInput
      ? {
        storage_layout_overrides:
        testCase.input.stdJsonInput.storage_layout_overrides,
      }
      : null;
  chai.expect(row.additional_input).to.deep.equal(expectedAdditionalInput);

  // compiled_contracts -> code columns
  chai
    .expect(row.compiled_creation_code)
    .to.equal(testCase.output.creationBytecode);
  chai
    .expect(row.compiled_runtime_code)
    .to.equal(testCase.output.deployedBytecode);
  chai
    .expect(row.compiled_creation_code_hash)
    .to.equal(keccak256(testCase.output.creationBytecode));
  chai
    .expect(row.compiled_runtime_code_hash)
    .to.equal(keccak256(testCase.output.deployedBytecode));
  chai
    .expect(row.compiled_creation_code_hash_keccak)
    .to.equal(keccak256(testCase.output.creationBytecode));
  chai
    .expect(row.compiled_runtime_code_hash_keccak)
    .to.equal(keccak256(testCase.output.deployedBytecode));

  // sources and compiled_contracts_sources columns
  const sources = testCase.input.stdJsonInput.sources;
  const expectedSources: Record<string, string> = {};
  Object.keys(sources).forEach((path) => {
    expectedSources[path] = sources[path].content;
  });
  chai
    .expect(
      resSources.reduce((sources: any, source: any) => {
        sources[source.path] = source.content;
        return sources;
      }, {}),
    )
    .to.deep.equal(expectedSources);

  // TODO: signatures and compiled_contracts_signatures columns
  // if (testCase.output.compilationArtifacts.abi) {
  // } else {
  // }

  // contract_deployments columns
  chai.expect(row.chain_id).to.equal(chainId);
  chai
    .expect(row.address)
    .to.deep.equal(deploymentInfo.contractAddress);
  chai
    .expect(row.transaction_hash)
    .to.deep.equal(deploymentInfo.txHash);
  chai.expect(parseInt(row.block_number)).to.equal(deploymentInfo.blockNumber);
  chai.expect(parseInt(row.transaction_index)).to.equal(deploymentInfo.txIndex);
  chai
    .expect(row.deployer)
    .to.deep.equal(deployerAddress);

  // contract_deployments -> code columns
  chai
    .expect(row.onchain_creation_code)
    .to.equal(testCase.onchain.creationBytecode);
  chai
    .expect(row.onchain_runtime_code)
    .to.equal(testCase.onchain.deployedBytecode);
  chai
    .expect(row.onchain_creation_code_hash)
    .to.equal(keccak256(testCase.onchain.creationBytecode));
  chai
    .expect(row.onchain_runtime_code_hash)
    .to.equal(keccak256(testCase.onchain.deployedBytecode));
  chai
    .expect(row.onchain_creation_code_hash_keccak)
    .to.equal(keccak256(testCase.onchain.creationBytecode));
  chai
    .expect(row.onchain_runtime_code_hash_keccak)
    .to.equal(keccak256(testCase.onchain.deployedBytecode));

  // verified_contracts columns
  chai
    .expect(row.creation_match === 1)
    .to.deep.equal(testCase.verification.creationMatch !== null);
  chai
    .expect(row.creation_values)
    .to.deep.equal(testCase.verification.creationValues);
  chai
    .expect(row.creation_transformations)
    .to.deep.equal(testCase.verification.creationTransformations);
  chai
    .expect(row.creation_metadata_match === 1)
    .to.equal(testCase.verification.creationMatch === "exact_match");
  chai
    .expect(row.runtime_match === 1)
    .to.deep.equal(testCase.verification.runtimeMatch !== null);
  chai
    .expect(row.runtime_values)
    .to.deep.equal(testCase.verification.runtimeValues);
  chai
    .expect(row.runtime_transformations)
    .to.deep.equal(testCase.verification.runtimeTransformations);
  chai
    .expect(row.runtime_metadata_match === 1)
    .to.equal(testCase.verification.runtimeMatch === "exact_match");

  // sourcify_matches columns
  chai
    .expect(row.sourcify_creation_match)
    .to.equal(toVerificationStatus(testCase.verification.creationMatch));
  chai
    .expect(row.sourcify_runtime_match)
    .to.equal(toVerificationStatus(testCase.verification.runtimeMatch));
  chai.expect(row.metadata).to.deep.equal(testCase.output.metadata);
}

export async function assertApiV2Lookup(
  serverFixture: ServerFixture,
  testCase: VerificationTestCase,
  chainId: number,
  deployerAddress: string,
  deploymentInfo: DeploymentInfo,
) {
  const res = await chai
    .request(serverFixture.server.app)
    .get(
      `/contract/${chainId}/${deploymentInfo.contractAddress}?fields=all`,
    );

  chai.expect(res.status).to.equal(200);

  // Default fields
  chai
    .expect(res.body.match)
    .to.equal(
      getTotalMatchLevel(
        toVerificationStatus(testCase.verification.creationMatch),
        toVerificationStatus(testCase.verification.runtimeMatch),
      ),
    );
  chai
    .expect(res.body.creationMatch)
    .to.equal(testCase.verification.creationMatch);
  chai
    .expect(res.body.runtimeMatch)
    .to.equal(testCase.verification.runtimeMatch);
  chai.expect(res.body.chainId).to.equal(chainId);
  chai.expect(res.body.address).to.equal(deploymentInfo.contractAddress);

  // creationBytecode
  chai.expect(res.body).to.have.property("creationBytecode");
  chai
    .expect(res.body.creationBytecode.onchainBytecode)
    .to.equal(testCase.onchain.creationBytecode);
  chai
    .expect(res.body.creationBytecode.recompiledBytecode)
    .to.equal(testCase.output.creationBytecode);
  chai
    .expect(res.body.creationBytecode.transformations)
    .to.deep.equal(testCase.verification.creationTransformations);
  chai
    .expect(res.body.creationBytecode.transformationValues)
    .to.deep.equal(testCase.verification.creationValues);
  chai
    .expect(res.body.creationBytecode.sourceMap)
    .to.deep.equal(testCase.output.creationCodeArtifacts.sourceMap);
  chai
    .expect(res.body.creationBytecode.linkReferences)
    .to.deep.equal(testCase.output.creationCodeArtifacts.linkReferences);
  chai
    .expect(res.body.creationBytecode.cborAuxdata)
    .to.deep.equal(testCase.output.creationCodeArtifacts.cborAuxdata);

  // runtimeBytecode
  chai.expect(res.body).to.have.property("runtimeBytecode");
  chai
    .expect(res.body.runtimeBytecode.onchainBytecode)
    .to.equal(testCase.onchain.deployedBytecode);
  chai
    .expect(res.body.runtimeBytecode.recompiledBytecode)
    .to.equal(testCase.output.deployedBytecode);
  chai
    .expect(res.body.runtimeBytecode.transformations)
    .to.deep.equal(testCase.verification.runtimeTransformations);
  chai
    .expect(res.body.runtimeBytecode.transformationValues)
    .to.deep.equal(testCase.verification.runtimeValues);
  chai
    .expect(res.body.runtimeBytecode.sourceMap)
    .to.deep.equal(testCase.output.runtimeCodeArtifacts.sourceMap);
  chai
    .expect(res.body.runtimeBytecode.linkReferences)
    .to.deep.equal(testCase.output.runtimeCodeArtifacts.linkReferences);
  chai
    .expect(res.body.runtimeBytecode.cborAuxdata)
    .to.deep.equal(testCase.output.runtimeCodeArtifacts.cborAuxdata);
  chai
    .expect(res.body.runtimeBytecode.immutableReferences)
    .to.deep.equal(testCase.output.runtimeCodeArtifacts.immutableReferences);

  // deployment
  chai.expect(res.body).to.have.property("deployment");
  chai
    .expect(res.body.deployment.transactionHash)
    .to.equal(deploymentInfo.txHash);
  chai
    .expect(res.body.deployment.blockNumber)
    .to.equal(deploymentInfo.blockNumber);
  chai
    .expect(res.body.deployment.transactionIndex)
    .to.equal(deploymentInfo.txIndex);
  chai.expect(res.body.deployment.deployer).to.equal(deployerAddress);

  // sources
  chai
    .expect(res.body.sources)
    .to.deep.equal(testCase.input.stdJsonInput.sources);

  // compilation
  chai.expect(res.body).to.have.property("compilation");
  chai
    .expect(res.body.compilation.language)
    .to.equal(testCase.input.stdJsonInput.language);
  chai
    .expect(res.body.compilation.compiler)
    .to.equal(
      getCompilerNameFromLanguage(testCase.input.stdJsonInput.language),
    );
  chai
    .expect(res.body.compilation.compilerVersion)
    .to.equal(testCase.input.compilerVersion);
  chai
    .expect(res.body.compilation.compilerSettings)
    .to.deep.equal(testCase.input.stdJsonInput.settings);
  const { contractName } = splitFullyQualifiedName(
    testCase.input.contractIdentifier,
  );
  chai.expect(res.body.compilation.name).to.equal(contractName);
  chai
    .expect(res.body.compilation.fullyQualifiedName)
    .to.equal(testCase.input.contractIdentifier);

  // abi
  chai
    .expect(res.body.abi)
    .to.deep.equal(testCase.output.compilationArtifacts.abi);

  // metadata
  chai.expect(res.body.metadata).to.deep.equal(testCase.output.metadata);

  // storageLayout
  chai
    .expect(res.body.storageLayout)
    .to.deep.equal(testCase.output.compilationArtifacts.storageLayout);

  // userdoc
  chai
    .expect(res.body.userdoc)
    .to.deep.equal(testCase.output.compilationArtifacts.userdoc);

  // devdoc
  chai
    .expect(res.body.devdoc)
    .to.deep.equal(testCase.output.compilationArtifacts.devdoc);

  // sourceIds
  chai
    .expect(res.body.sourceIds)
    .to.deep.equal(testCase.output.compilationArtifacts.sources);

  // additionalInput
  const expectedApiAdditionalInput =
    "storage_layout_overrides" in testCase.input.stdJsonInput
      ? {
        storage_layout_overrides:
        testCase.input.stdJsonInput.storage_layout_overrides,
      }
      : null;
  chai
    .expect(res.body.additionalInput)
    .to.deep.equal(expectedApiAdditionalInput);

  // stdJsonInput
  chai.expect(res.body.stdJsonInput).to.deep.equal(testCase.input.stdJsonInput);

  // TODO: signatures
  // chai.expect(res.body).to.have.property("signatures");
}
