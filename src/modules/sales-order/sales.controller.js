import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { queueSalesOrder, readSalesOrder, waitForSalesOrderCompletion } from "./sales.service.js";
import { validateSalesOrderRequest } from "./sales.validator.js";
import { validateSalesPdfLookup } from "../sales/sales.validator.js";

const getVoucherFromTally = (transactionType, label) => asyncHandler(async (req, res) => {
  const { lookup, errors } = validateSalesPdfLookup(req.query);
  if (errors.length) return failureResponse(res, { code: 2001, httpStatus: 400, message: "company, ledger_name and voucher_no are required; voucher_date is optional.", data: { errors } });
  const result = await queueSalesOrder({
    client_id: req.client.client_id,
    transaction_type: transactionType,
    destination: { company: lookup.company },
    lookup: { company: lookup.company, ledger_name: lookup.ledgerName, voucher_no: lookup.voucherNumber, ...(lookup.voucherDate ? { voucher_date: lookup.voucherDate } : {}) },
  });
  const completion = await waitForSalesOrderCompletion(req.client.client_id, result.request.request_id, { shouldStop: () => res.destroyed });
  if (completion.disconnected) return;
  if (!completion.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: `${label} lookup job not found.` });
  if (completion.timedOut) return failureResponse(res, { code: 2011, httpStatus: 504, message: `Connector did not return the Tally ${label} before timeout.`, data: { request_id: result.request.request_id } });
  const tallyResult = completion.request.tally_result;
  if (completion.request.status === "failed") return failureResponse(res, { code: 2012, httpStatus: tallyResult?.lookup_status || 502, message: completion.request.error || `Tally ${label} lookup failed.` });
  if (!tallyResult?.voucher) return failureResponse(res, { code: 2012, httpStatus: 502, message: `Tally returned no ${label} data.` });
  return successResponse(res, { message: `${label} retrieved from Tally.`, data: { vouchers: [tallyResult.voucher] } });
});

export const getSalesOrderFromTally = getVoucherFromTally("sales_order_lookup", "Sales Order");
export const getSalesVoucherFromTally = getVoucherFromTally("sales_voucher_lookup", "Sales Voucher");

export const pushSalesOrder = asyncHandler(async (req, res) => {
  const errors = validateSalesOrderRequest(req.body);
  if (errors.length) {
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "Invalid sales order request.",
      data: { errors },
    });
  }

  const result = await queueSalesOrder({ ...req.body, client_id: req.client.client_id });
  const completion = await waitForSalesOrderCompletion(req.client.client_id, result.request.request_id, {
    shouldStop: () => res.destroyed,
  });
  if (completion.disconnected) return;
  if (!completion.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales order request was not found while waiting for the Connector." });
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
      message: lookupStatus === 404 || lookupStatus === 409 ? completion.request.error || "Company validation failed." : "Tally did not accept the Sales Order.",
      data: { request_id: completion.request.request_id, status: completion.request.status, error: completion.request.error },
    });
  }

  const tallyResult = completion.request.tally_result || null;
  const submittedVoucherNumber = completion.request.sales_order?.voucher_number || completion.request.sales_order?.order_number || null;
  const voucherNumber = tallyResult?.voucher_number_source === "tally" ? tallyResult.voucher_number : null;
  return successResponse(res, {
    code: 1000,
    httpStatus: 200,
    message: "Tally accepted the Sales Order.",
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

export const getSalesOrderRequest = asyncHandler(async (req, res) => {
  const request = await readSalesOrder(req.client.client_id, req.params.requestId);
  if (!request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales order request not found." });
  return successResponse(res, { code: 1000, httpStatus: 200, message: "Sales order request retrieved.", data: request });
});
