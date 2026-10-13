import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { waitForSalesOrderCompletion } from "../sales-order/sales.service.js";
import { queuePurchaseTransaction, readPurchaseTransaction } from "./purchase.service.js";
import { validatePurchaseRequest } from "./purchase.validator.js";

const config = {
  purchase_order: { field: "purchase_order", label: "Purchase Order" },
  purchase_voucher: { field: "purchase", label: "Purchase Voucher" },
  payment_voucher: { field: "payment", label: "Payment Voucher" },
};

export function pushPurchase(kind) {
  return asyncHandler(async (req, res) => {
    const current = config[kind];
    const errors = validatePurchaseRequest(req.body, kind);
    if (errors.length) return failureResponse(res, { code: 2001, httpStatus: 400, message: `Invalid ${current.label} request.`, data: { errors } });
    const queued = await queuePurchaseTransaction({ ...req.body, client_id: req.client.client_id }, kind);
    const completion = await waitForSalesOrderCompletion(req.client.client_id, queued.request.request_id, { shouldStop: () => res.destroyed });
    if (completion.disconnected) return;
    if (!completion.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: `${current.label} request was not found while waiting for the Connector.` });
    if (completion.timedOut) return failureResponse(res, { code: 2011, httpStatus: 504, message: "The Connector has not returned a Tally result before the response timeout. The request remains queued or processing.", data: { request_id: completion.request.request_id, status: completion.request.status } });
    if (completion.request.status === "failed") return failureResponse(res, { code: 2012, httpStatus: 502, message: `Tally did not accept the ${current.label}.`, data: { request_id: completion.request.request_id, status: completion.request.status, error: completion.request.error } });

    const tallyResult = completion.request.tally_result || null;
    const submitted = completion.request[current.field]?.voucher_number || completion.request[current.field]?.order_number || null;
    return successResponse(res, {
      code: 1000,
      httpStatus: 200,
      message: `Tally accepted the ${current.label}.`,
      data: {
        request_id: completion.request.request_id,
        status: completion.request.status,
        duplicate: queued.duplicate,
        transaction_type: kind,
        voucher_number: tallyResult?.voucher_number_source === "tally" ? tallyResult.voucher_number : null,
        submitted_voucher_number: tallyResult?.submitted_voucher_number || submitted,
        tally_result: tallyResult,
      },
    });
  });
}

export function getPurchaseRequest(kind) {
  return asyncHandler(async (req, res) => {
    const request = await readPurchaseTransaction(req.client.client_id, req.params.requestId);
    if (!request || request.transaction_type !== kind) return failureResponse(res, { code: 2004, httpStatus: 404, message: `${config[kind].label} request not found.` });
    return successResponse(res, { code: 1000, httpStatus: 200, message: `${config[kind].label} request retrieved.`, data: request });
  });
}
