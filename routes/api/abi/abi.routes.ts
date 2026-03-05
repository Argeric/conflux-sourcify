import { Router } from "express";
import { listABIsEndpoint } from "./abi.handler";
import { validateFuncSelectorHash } from "../middlewares";

const router = Router();

router.route("/abi/:hash").get(validateFuncSelectorHash, listABIsEndpoint);

export default router;
