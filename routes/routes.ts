import { Router } from "express"; // static is a reserved word
import lookupRoutes from "./api/lookup/lookup.routes";
import jobsRoutes from "./api/jobs/jobs.routes";
import verificationRoutes from "./api/verification/verification.routes";
import abiRoutes from "./api/abi/abi.routes";
import { ChainMap } from "../server";

const router: Router = Router();

router.get("/health", (_req, res) => {
  res.status(200).send("Alive and kicking!");
});

router.get("/chains", (_req, res) => {
  const chainMap = _req.app.get("chains") as ChainMap;
  const chainsArray = Object.values(chainMap);
  const chains = chainsArray.map(
    ({
      rpcs,
      name,
      title,
      chainId,
      supported,
      confluxscanApi,
    }) => {
      return {
        name,
        title,
        chainId,
        rpc: rpcs
        .map((r) => r.urlWithoutApiKey)
        .filter((url) => url !== undefined),
        traceSupportedRPCs: rpcs
          .map((r, index) =>
            r.traceSupport ? { type: r.traceSupport, index } : null,
          )
          .filter((r) => r !== null),
        supported,
        confluxscanApi: confluxscanApi?.apiURL,
      };
    },
  );

  res.status(200).json(chains);
});

router.use("/", lookupRoutes);
router.use("/", verificationRoutes);
router.use("/", jobsRoutes);
router.use("/", abiRoutes);

export default router;
