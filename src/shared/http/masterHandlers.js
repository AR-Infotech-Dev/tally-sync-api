import { asyncHandler } from "../utils/asyncHandler.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";
import { waitForConnectorJobCompletion } from "../../modules/connector-jobs/connector-job.service.js";

export function createMasterHandlers({
  label,
  validate,
  queue,
  read,
  wait = waitForConnectorJobCompletion,
}) {
  const create = asyncHandler(async (req, res) => {
    const errors = validate(req.body);
    if (errors.length)
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: `Invalid ${label.toLowerCase()} request.`,
        data: { errors },
      });
    const result = await queue({ ...req.body, client_id: req.client.client_id });
    const completion = await wait(req.client.client_id, result.request.request_id, {
      shouldStop: () => res.destroyed,
    });
    if (completion.disconnected) return;
    const request = completion.request;
    if (!request)
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: `${label} request not found.`,
      });
    if (completion.timedOut)
      return failureResponse(res, {
        code: 2011,
        httpStatus: 504,
        message:
          "The Connector has not returned a verified Tally result. Check this request's status before submitting again.",
        data: { request_id: request.request_id, status: request.status },
      });
    if (request.status === "failed")
      return failureResponse(res, {
        code: 2012,
        httpStatus: request.tally_result?.lookup_status || 502,
        message: request.error || `${label} creation failed.`,
        data: {
          request_id: request.request_id,
          status: request.status,
          error_code: request.tally_result?.error_code || "LEDGER_CREATE_FAILED",
          tally_result: request.tally_result || null,
        },
      });
    if (
      request.status !== "succeeded" ||
      request.tally_result?.verified !== true ||
      !request.tally_result?.ledger?.master_id ||
      !request.tally_result?.ledger?.guid
    )
      return failureResponse(res, {
        code: 2012,
        httpStatus: 502,
        message: "The Connector did not return a verified ledger identity.",
        data: {
          request_id: request.request_id,
          status: request.status,
          error_code: "LEDGER_CREATE_UNVERIFIED",
        },
      });
    return successResponse(res, {
      message: `${label} is present in Tally and verified.`,
      data: {
        request_id: request.request_id,
        status: request.status,
        duplicate: result.duplicate,
        transaction_type: request.transaction_type,
        ledger: request.tally_result?.ledger || null,
        tally_result: request.tally_result || null,
      },
    });
  });
  const getRequest = asyncHandler(async (req, res) => {
    const request = await read(req.client.client_id, req.params.requestId);
    if (!request)
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: `${label} request not found.`,
      });
    return successResponse(res, { message: `${label} request retrieved.`, data: request });
  });
  return { create, getRequest };
}
