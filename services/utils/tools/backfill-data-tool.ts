import { Tables } from "../../store/Tables";
import { QueryTypes } from "sequelize";
import { init, close, chainMap } from "./abi-tool";
import { getContractCreation, getCreatorTx } from "../contract-creation-util";

async function run() {
  await init();

  const args = process.argv.slice(2);
  const type = Number(args[0]);

  if (type == 1) {
    await backfillTransformationValues();
  }

  await close();
}

/**
 * biz
 */
async function backfillTransformationValues() {
  const KEY_BACKFILL_ID = "backfill_transformation_values_id";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const lastId = await Tables.KV.getNumber(KEY_BACKFILL_ID, 0);
    const verifiedContracts = await Tables.VerifiedContract.sequelize!.query(`
      select * from (
        select 
          sm.id as id, 
          vc.id as vc_id, 
          vc.creation_transformations as creation_transformations, 
          vc.creation_values as creation_values, 
          cd.chain_id as chain_id, 
          cd.address as address
        from verified_contracts vc
        join contract_deployments cd on vc.deployment_id = cd.id
        join sourcify_matches sm on vc.id = sm.verified_contract_id
        where sm.similar_match_chain_id is not null
          and vc.creation_values is not null
          and JSON_LENGTH(vc.creation_values) > 0 
        order by sm.id asc
     ) tmp
      where tmp.id > ?
      limit 10
    `, {
      type: QueryTypes.SELECT,
      replacements: [lastId],
      logging: console.log,
    });

    if (verifiedContracts.length > 0) {
      for (const verifiedContract of verifiedContracts) {
        await updateVerifiedContract(verifiedContract);
        await Tables.KV.saveNumber(KEY_BACKFILL_ID, (verifiedContract as any).id);
      }
      console.log(`Processed ${verifiedContracts.length} verified contracts, lastId=${(verifiedContracts[verifiedContracts.length - 1] as any).id}`);
    } else {
      console.log("Done!");
      break;
    }
  }
}

async function updateVerifiedContract(verifiedContract: any) {
  const { vc_id, creation_transformations, creation_values, chain_id, address } = verifiedContract as any;
  const chain = chainMap[chain_id.toString()];
  // const foundCreationTxHash = await getCreatorTx(chain, address);
  // const { creationBytecode } = await chain.getContractCreationBytecodeAndReceipt(address, foundCreationTxHash!); // The code "txReceipt.contractAddress.toLowerCase() !== address.toLowerCase()" in SourcifyChain will throw error.
  const { creationBytecode } = await getContractCreation(chain, address);

  for (const transformation of creation_transformations || []) {
    if (transformation.reason === "constructorArguments") {
      creation_values!.constructorArguments = "0x" + creationBytecode.slice(transformation.offset * 2 + 2)
    }
    if (transformation.reason === "cborAuxdata") {
      const { id, offset } = transformation;
      const cborAuxdataSimilar = creation_values!.cborAuxdata![id!];
      creation_values!.cborAuxdata![id!] = "0x" + creationBytecode.slice(
        offset * 2 + 2,
        offset * 2 + 2 + cborAuxdataSimilar.slice(2).length,
      );
    }
  }

  await Tables.VerifiedContract.update({
    creation_values,
  }, {
    where: {
      id: vc_id,
    },
  });
}

if (require.main === module) {
  run().then();
}
