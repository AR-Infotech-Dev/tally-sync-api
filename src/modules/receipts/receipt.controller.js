import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { queueReceiptVoucher, readReceiptVoucher } from "./receipt.service.js";
import { waitForSalesOrderCompletion } from "../sales-order/sales.service.js";
import { validateReceiptVoucherRequest } from "./receipt.validator.js";

export const pushReceiptVoucher = asyncHandler(async (req, res) => {
  const errors = validateReceiptVoucherRequest(req.body);
  if (errors.length) {
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "Invalid Receipt Voucher request.",
      data: { errors },
    });
  }

  const result = await queueReceiptVoucher({ ...req.body, client_id: req.client.client_id });
  const completion = await waitForSalesOrderCompletion(req.client.client_id, result.request.request_id, {
    shouldStop: () => res.destroyed,
  });
  if (completion.disconnected) return;
  if (!completion.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Receipt Voucher request was not found while waiting for the Connector." });
  if (completion.timedOut) {
    return failureResponse(res, {
      code: 2011,
      httpStatus: 504,
      message: "The Connector has not returned a Tally result before the response timeout. The request remains queued or processing.",
      data: { request_id: completion.request.request_id, status: completion.request.status },
    });
  }
  if (completion.request.status === "failed") {
      const lookupStatus = completion.request.tally_result?.lookup_status || 502;
    return failureResponse(res, {
      code: 2012,
        httpStatus: lookupStatus,
        message: lookupStatus === 404 || lookupStatus === 409 ? completion.request.error || "Company validation failed." : "Tally did not accept the Receipt Voucher.",
      data: { request_id: completion.request.request_id, status: completion.request.status, error: completion.request.error },
    });
  }

  const tallyResult = completion.request.tally_result || null;
  const submittedVoucherNumber = completion.request.receipt?.voucher_number || null;
  const voucherNumber = tallyResult?.voucher_number_source === "tally" ? tallyResult.voucher_number : null;
  return successResponse(res, {
    code: 1000,
    httpStatus: 200,
    message: "Tally accepted the Receipt Voucher.",
    data: {
      request_id: completion.request.request_id,
      status: completion.request.status,
      duplicate: result.duplicate,
      transaction_type: completion.request.transaction_type,
      voucher_number: voucherNumber,
      submitted_voucher_number: tallyResult?.submitted_voucher_number || submittedVoucherNumber,
      tally_result: tallyResult,
    },
  });
});

export const getReceiptVoucherRequest = asyncHandler(async (req, res) => {
  const request = await readReceiptVoucher(req.client.client_id, req.params.requestId);
  if (!request || request.transaction_type !== "receipt_voucher") {
    return failureResponse(res, { code: 2004, httpStatus: 404, message: "Receipt Voucher request not found." });
  }
  return successResponse(res, { code: 1000, httpStatus: 200, message: "Receipt Voucher request retrieved.", data: request });
});
