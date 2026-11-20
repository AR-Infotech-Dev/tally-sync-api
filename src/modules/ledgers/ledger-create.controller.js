import { createMasterHandlers } from "../../shared/http/masterHandlers.js";
import { validateLedgerCreate } from "./ledger-create.validator.js";
import {
  queueLedgerCreate,
  readLedgerCreate,
  claimLedgerCreateImport,
} from "./ledger-create.service.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { successResponse,  failureResponse } from "../../shared/utils/apiResponse.js";

const handlers = createMasterHandlers({
  label: "Ledger",
  validate: validateLedgerCreate,
  queue: queueLedgerCreate,
  read: readLedgerCreate,
});
export const createLedger = handlers.create;
export const getLedgerCreateRequest = handlers.getRequest;
export const claimLedgerCreate = asyncHandler(async (req, res) => {
  const result = await claimLedgerCreateImport(req.client.client_id, req.params.requestId);
  if (!result)
    return failureResponse(res, {
      code: 2004,
      httpStatus: 404,
      message: "Ledger request not found.",
    });
  return successResponse(res, { message: "Ledger import claim checked.", data: result });
});
