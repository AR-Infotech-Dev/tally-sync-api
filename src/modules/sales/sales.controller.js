import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { queueSalesVoucher, readSalesVoucher } from "./sales.service.js";
import { waitForSalesOrderCompletion } from "../sales-order/sales.service.js";
import { validateSalesVoucherRequest, validateSalesPdfLookup } from "./sales.validator.js";
import { completeSalesPdf, failSalesPdf, markSalesPdfGenerating, readSalesPdf } from "./sales-pdf.model.js";
import { requestSalesVoucherPdf, requestSalesVoucherPdfByNumber } from "./sales-pdf.service.js";

export const pushSalesVoucher = asyncHandler(async (req, res) => {
  const errors = validateSalesVoucherRequest(req.body);
  if (errors.length) {
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "Invalid Sales Voucher request.",
      data: { errors },
    });
  }

  const result = await queueSalesVoucher({ ...req.body, client_id: req.client.client_id });
  const completion = await waitForSalesOrderCompletion(req.client.client_id, result.request.request_id, {
    shouldStop: () => res.destroyed,
  });
  if (completion.disconnected) return;
  if (!completion.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales Voucher request was not found while waiting for the Connector." });
  if (completion.timedOut) {
    return failureResponse(res, {
      code: 2011,
      httpStatus: 504,
      message: "The Connector has not returned a Tally result before the response timeout. The request remains queued or processing.",
      data: { request_id: completion.request.request_id, status: completion.request.status },
    });
  }
  if (completion.request.status === "failed") {
    return failureResponse(res, {
      code: 2012,
      httpStatus: 502,
      message: "Tally did not accept the Sales Voucher.",
      data: { request_id: completion.request.request_id, status: completion.request.status, error: completion.request.error },
    });
  }

  const tallyResult = completion.request.tally_result || null;
  const submittedVoucherNumber = completion.request.sales_order?.voucher_number || completion.request.sales_order?.order_number || null;
  const voucherNumber = tallyResult?.voucher_number_source === "tally" ? tallyResult.voucher_number : null;
  return successResponse(res, {
    code: 1000,
    httpStatus: 200,
    message: "Tally accepted the Sales Voucher.",
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

export const getSalesVoucherRequest = asyncHandler(async (req, res) => {
  const request = await readSalesVoucher(req.client.client_id, req.params.requestId);
  if (!request || request.transaction_type !== "sales_voucher") {
    return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales Voucher request not found." });
  }
  return successResponse(res, { code: 1000, httpStatus: 200, message: "Sales Voucher request retrieved.", data: request });
});

export const requestSalesVoucherPdfDownload = asyncHandler(async (req, res) => {
  const result = await requestSalesVoucherPdf(req.client.client_id, req.params.requestId, { retry: req.query.retry === "true" });
  return sendSalesVoucherPdf(res, result, req.params.requestId);
});

export const requestSalesVoucherPdfDownloadByNumber = asyncHandler(async (req, res) => {
  const { lookup, errors } = validateSalesPdfLookup(req.query);
  if (errors.length) return failureResponse(res, { code: 2001, httpStatus: 400, message: "company, ledger_name and voucher_no are required; voucher_date is optional.", data: { errors } });
  const result = await requestSalesVoucherPdfByNumber(req.client.client_id, lookup.company, lookup.voucherNumber, { retry: req.query.retry === "true", partyLedger: lookup.ledgerName, voucherDate: lookup.voucherDate });
  return sendSalesVoucherPdf(res, result, result.requestId);
});

function sendSalesVoucherPdf(res, result, requestId) {
  if (result.error === "not_found") return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales Voucher request not found." });
  if (result.error === "not_succeeded") return failureResponse(res, { code: 2009, httpStatus: 409, message: `Sales Voucher is not ready for PDF export (status: ${result.status}).` });
  if (result.pdf) {
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${result.pdf.filename || "sales-voucher.pdf"}"`, "Cache-Control": "no-store" });
    const content = Buffer.isBuffer(result.pdf.pdf) ? result.pdf.pdf : result.pdf.pdf?.value?.(true) || result.pdf.pdf?.buffer;
    return res.status(200).send(content);
  }
  if (result.job?.status === "failed") return failureResponse(res, { code: 2010, httpStatus: 424, message: `Sales Voucher PDF export failed: ${result.job.error || "Unknown export error."} Retry with ?retry=true after fixing the Connector/Tally issue.` });
  return successResponse(res, {
    code: 1002,
    httpStatus: 202,
    message: "Sales Voucher PDF export requested. Poll this endpoint again to download it when ready.",
    data: { request_id: requestId, pdf_status: result.job.status, connector_notified: result.connectorNotified },
  });
}

export const uploadSalesVoucherPdf = asyncHandler(async (req, res) => {
  const pdfJob = await readSalesPdf(req.client.client_id, req.params.requestId);
  const request = await readSalesVoucher(req.client.client_id, req.params.requestId);
  if (!pdfJob?.lookup && (!request || request.transaction_type !== "sales_voucher")) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales Voucher request not found." });
  if (!pdfJob?.lookup && request.status !== "succeeded") return failureResponse(res, { code: 2009, httpStatus: 409, message: "PDF is accepted only for a Sales Voucher already accepted by Tally." });
  if (!pdfJob || !["queued", "generating"].includes(pdfJob.status)) return failureResponse(res, { code: 2009, httpStatus: 409, message: "No active PDF export request exists for this Sales Voucher." });
  const pdf = req.body;
  // MongoDB's BSON document cap is 16 MB, so keep room for document metadata.
  if (!Buffer.isBuffer(pdf) || pdf.length < 8 || pdf.length > 15 * 1024 * 1024 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return failureResponse(res, { code: 2001, httpStatus: 400, message: "Connector must upload a valid PDF file up to 15 MB." });
  }
  await completeSalesPdf(req.client.client_id, req.params.requestId, pdf, req.get("x-pdf-filename") || "sales-voucher.pdf", pdfJob.lookup ? undefined : request.expires_at);
  return successResponse(res, { code: 1000, httpStatus: 200, message: "Sales Voucher PDF stored and ready for CRM download.", data: { request_id: req.params.requestId, pdf_status: "ready" } });
});

export const updateSalesVoucherPdfStatus = asyncHandler(async (req, res) => {
  const pdfJob = await readSalesPdf(req.client.client_id, req.params.requestId);
  if (!pdfJob?.lookup) {
    const request = await readSalesVoucher(req.client.client_id, req.params.requestId);
    if (!request || request.transaction_type !== "sales_voucher") return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales Voucher request not found." });
  }
  if (!pdfJob || !["queued", "generating"].includes(pdfJob.status)) return failureResponse(res, { code: 2009, httpStatus: 409, message: "No active PDF export request exists for this Sales Voucher." });
  if (req.body?.status === "generating") await markSalesPdfGenerating(req.client.client_id, req.params.requestId);
  else if (req.body?.status === "failed") await failSalesPdf(req.client.client_id, req.params.requestId, req.body.error);
  else return failureResponse(res, { code: 2001, httpStatus: 400, message: "Status must be generating or failed." });
  return successResponse(res, { code: 1000, httpStatus: 200, message: "Sales Voucher PDF status updated.", data: { request_id: req.params.requestId, pdf_status: req.body.status } });
});

export const getSalesPdfConnectorJob = asyncHandler(async (req, res) => {
  const job = await readSalesPdf(req.client.client_id, req.params.requestId);
  if (!job) return failureResponse(res, { code: 2004, httpStatus: 404, message: "PDF export job not found." });
  return successResponse(res, { data: { request_id: job.request_id, lookup: job.lookup || null } });
});
