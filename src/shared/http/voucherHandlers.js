import { asyncHandler } from "../utils/asyncHandler.js";
import { failureResponse, successResponse } from "../utils/apiResponse.js";
import { waitForConnectorJobCompletion } from "../../modules/connector-jobs/connector-job.service.js";

export function createVoucherHandlers({
  label, field, kind, validate, queue, read,
  validationMessage = `Invalid ${label} request.`,
  wait = waitForConnectorJobCompletion,
  missingWaitLabel = label,
  requestLabel = label,
  includeFailureResult = false,
  allowOrderNumber = true,
}) {
  const push = asyncHandler(async (req, res) => {
    const errors = validate(req.body);
    if (errors.length) return failureResponse(res, { code: 2001, httpStatus: 400, message: validationMessage, data: { errors } });
    const result = await queue({ ...req.body, client_id: req.client.client_id });
    const completion = await wait(req.client.client_id, result.request.request_id, { shouldStop: () => res.destroyed });
    if (completion.disconnected) return;
    if (!completion.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: `${missingWaitLabel} request was not found while waiting for the Connector.` });
    const request = completion.request;
    if (completion.timedOut) return failureResponse(res, {
      code: 2011, httpStatus: 504,
      message: "The Connector has not returned a Tally result before the response timeout. The request remains queued or processing.",
      data: { request_id: request.request_id, status: request.status },
    });
    if (request.status === "failed") {
      const status = request.tally_result?.lookup_status || 502;
      return failureResponse(res, {
        code: 2012, httpStatus: status,
        message: status === 404 || status === 409 ? request.error || "Company validation failed." : `Tally did not accept the ${label}.`,
        data: {
          request_id: request.request_id, status: request.status, error: request.error,
          ...(includeFailureResult && request.tally_result ? { tally_result: request.tally_result } : {}),
        },
      });
    }
    const tallyResult = request.tally_result || null;
    const voucher = request[field];
    return successResponse(res, { message: `Tally accepted the ${label}.`, data: {
      request_id: request.request_id, status: request.status, duplicate: result.duplicate, transaction_type: request.transaction_type,
      voucher_number: tallyResult?.voucher_number_source === "tally" ? tallyResult.voucher_number : null,
      submitted_voucher_number: tallyResult?.submitted_voucher_number || voucher?.voucher_number || (allowOrderNumber && voucher?.order_number) || null,
      tally_result: tallyResult,
    } });
  });
  const getRequest = asyncHandler(async (req, res) => {
    const request = await read(req.client.client_id, req.params.requestId);
    if (!request || (kind && request.transaction_type !== kind)) return failureResponse(res, { code: 2004, httpStatus: 404, message: `${requestLabel} request not found.` });
    return successResponse(res, { message: `${requestLabel} request retrieved.`, data: request });
  });
  return { push, getRequest };
}
