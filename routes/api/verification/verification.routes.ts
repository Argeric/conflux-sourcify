import {
  validateAddress,
  validateChainId,
  validateContractIdentifier,
  validateMetadata,
  checkIfAlreadyVerified,
  checkIfJobIsAlreadyRunning,
  validateStandardJsonInput,
  validateAndNormalizeFeInput,
  validateCompilerVersion,
  validateSources
} from "../middlewares";
import {
  verifyFromJsonInputEndpoint,
  verifyFromMetadataEndpoint,
  verifyFromConfluxscanEndpoint,
  verifyFromCrossChainEndpoint,
} from "./verification.handlers";
import { Router } from "express";

const router = Router();

router
  .route("/verify/:chainId/:address")
  .post(
    validateChainId,
    validateAddress,
    validateStandardJsonInput,
    validateAndNormalizeFeInput,
    validateContractIdentifier,
    validateCompilerVersion,
    checkIfAlreadyVerified,
    checkIfJobIsAlreadyRunning,
    verifyFromJsonInputEndpoint,
  );

router
  .route("/verify/metadata/:chainId/:address")
  .post(
    validateChainId,
    validateAddress,
    validateMetadata,
    validateSources,
    checkIfAlreadyVerified,
    checkIfJobIsAlreadyRunning,
    verifyFromMetadataEndpoint,
  );

router
  .route("/verify/confluxscan/:chainId/:address")
  .post(
    validateChainId,
    validateAddress,
    checkIfAlreadyVerified,
    checkIfJobIsAlreadyRunning,
    verifyFromConfluxscanEndpoint,
  );

router
  .route("/verify/crosschain/:chainId/:address")
  .post(
    validateChainId,
    validateAddress,
    checkIfAlreadyVerified,
    checkIfJobIsAlreadyRunning,
    verifyFromCrossChainEndpoint,
  );

export default router;
