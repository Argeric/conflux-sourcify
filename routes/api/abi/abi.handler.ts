import { StatusCodes } from "http-status-codes";
import { Services } from "../../../services/services";
import { Request } from "express";
import { TypedResponse, VerifiedABI } from "../../types";

interface ListAbiRequest extends Request {
  params: {
    hash: string;
  };
}

type ListAbiResponse = TypedResponse<{
  results: VerifiedABI[];
}>;

export async function listABIsEndpoint(req: ListAbiRequest, res: ListAbiResponse) {
  const services = req.app.get("services") as Services;

  const list = await services.store.listABIsByHash(
    req.params.hash
  );

  res.status(StatusCodes.OK).json(list);
}
