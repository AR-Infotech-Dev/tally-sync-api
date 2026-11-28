import { validateMfgPdfLookup } from "./mfg-journal.lookup.validator.js";
import { createVoucherHandlers } from "../../shared/http/voucherHandlers.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { queueMfgJournal, readMfgJournal } from "./mfg-journal.service.js";
import { validateMfgJournalRequest } from "./mfg-journal.validator.js";
import {
  completeMfgPdf,
  failMfgPdf,
  markMfgPdfGenerating,
  readMfgPdf,
} from "./mfg-journal-pdf.model.js";
import { requestMfgJournalPdf, requestMfgJournalPdfByNumber } from "./mfg-journal-pdf.service.js";
import { assertNoAvailabilityFailure } from "../connectors/connectorAvailability.service.js";

const voucherHandlers = createVoucherHandlers({
  label: "MFG Journal",
  field: "mfg_journal",
  kind: "mfg_journal",
  validate: validateMfgJournalRequest,
  queue: queueMfgJournal,
  read: readMfgJournal,
});
export const pushMfgJournal = voucherHandlers.push;
export const getMfgJournalRequest = voucherHandlers.getRequest;

export const requestMfgJournalPdfDownload = asyncHandler(async (req, res) => {
  const result = await requestMfgJournalPdf(req.client.client_id, req.params.requestId, {
    retry: req.query.retry === "true",
  });
  return sendMfgJournalPdf(res, result, req.params.requestId);
});

export const requestMfgJournalPdfDownloadByNumber = asyncHandler(async (req, res) => {
  const { lookup, errors } = validateMfgPdfLookup(req.query);
  if (errors.length)
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "company_id, voucher_type and voucher_no are required; voucher_date is optional.",
      data: { errors },
    });
  const result = await requestMfgJournalPdfByNumber(
    req.client.client_id,
    lookup.companyId,
    lookup.voucherNumber,
    {
      retry: req.query.retry === "true",
      voucherType: lookup.voucherType,
      voucherDate: lookup.voucherDate,
    },
  );
  return sendMfgJournalPdf(res, result, result.requestId);
});

function sendMfgJournalPdf(res, result, requestId) {
  if (result.error === "not_found")
    return failureResponse(res, {
      code: 2004,
      httpStatus: 404,
      message: "MFG Journal request not found.",
    });
  if (result.error === "not_succeeded")
    return failureResponse(res, {
      code: 2009,
      httpStatus: 409,
      message: `MFG Journal is not ready for PDF export (status: ${result.status}).`,
    });
  if (result.pdf) {
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.pdf.filename || "mfg-journal.pdf"}"`,
      "Cache-Control": "no-store",
    });
    const content = Buffer.isBuffer(result.pdf.pdf)
      ? result.pdf.pdf
      : result.pdf.pdf?.value?.(true) || result.pdf.pdf?.buffer;
    return res.status(200).send(content);
  }
  assertNoAvailabilityFailure({
    ...result.job,
    tally_result: { error_code: result.job?.error_code },
  });
  if (result.job?.status === "failed")
    return failureResponse(res, {
      code: 2010,
      httpStatus: 424,
      message: `MFG Journal PDF export failed: ${result.job.error || "Unknown export error."} Retry with ?retry=true after fixing the Connector/Tally issue.`,
    });
  return successResponse(res, {
    code: 1002,
    httpStatus: 202,
    message:
      "MFG Journal PDF export requested. Poll this endpoint again to download it when ready.",
    data: {
      request_id: requestId,
      pdf_status: result.job.status,
      connector_notified: result.connectorNotified,
    },
  });
}

export const uploadMfgJournalPdf = asyncHandler(async (req, res) => {
  const pdfJob = await readMfgPdf(req.client.client_id, req.params.requestId);
  const request = await readMfgJournal(req.client.client_id, req.params.requestId);
  if (!pdfJob?.lookup && (!request || request.transaction_type !== "mfg_journal"))
    return failureResponse(res, {
      code: 2004,
      httpStatus: 404,
      message: "MFG Journal request not found.",
    });
  if (!pdfJob?.lookup && request.status !== "succeeded")
    return failureResponse(res, {
      code: 2009,
      httpStatus: 409,
      message: "PDF is accepted only for a MFG Journal already accepted by Tally.",
    });
  if (!pdfJob || !["queued", "generating"].includes(pdfJob.status))
    return failureResponse(res, {
      code: 2009,
      httpStatus: 409,
      message: "No active PDF export request exists for this MFG Journal.",
    });
  const pdf = req.body;
  // MongoDB's BSON document cap is 16 MB, so keep room for document metadata.
  if (
    !Buffer.isBuffer(pdf) ||
    pdf.length < 8 ||
    pdf.length > 15 * 1024 * 1024 ||
    pdf.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "Connector must upload a valid PDF file up to 15 MB.",
    });
  }
  await completeMfgPdf(
    req.client.client_id,
    req.params.requestId,
    pdf,
    req.get("x-pdf-filename") || "mfg-journal.pdf",
    pdfJob.lookup ? undefined : request.expires_at,
  );
  return successResponse(res, {
    code: 1000,
    httpStatus: 200,
    message: "MFG Journal PDF stored and ready for CRM download.",
    data: { request_id: req.params.requestId, pdf_status: "ready" },
  });
});

export const updateMfgJournalPdfStatus = asyncHandler(async (req, res) => {
  const pdfJob = await readMfgPdf(req.client.client_id, req.params.requestId);
  if (!pdfJob?.lookup) {
    const request = await readMfgJournal(req.client.client_id, req.params.requestId);
    if (!request || request.transaction_type !== "mfg_journal")
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: "MFG Journal request not found.",
      });
  }
  if (!pdfJob || !["queued", "generating"].includes(pdfJob.status))
    return failureResponse(res, {
      code: 2009,
      httpStatus: 409,
      message: "No active PDF export request exists for this MFG Journal.",
    });
  if (req.body?.status === "generating")
    await markMfgPdfGenerating(req.client.client_id, req.params.requestId);
  else if (req.body?.status === "failed") {
    if (
      req.body.error_code &&
      !["TALLY_NOT_CONNECTED", "TALLY_TIMEOUT"].includes(req.body.error_code)
    )
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Invalid PDF failure code.",
      });
    await failMfgPdf(
      req.client.client_id,
      req.params.requestId,
      req.body.error,
      req.body.error_code,
    );
  } else
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "Status must be generating or failed.",
    });
  return successResponse(res, {
    code: 1000,
    httpStatus: 200,
    message: "MFG Journal PDF status updated.",
    data: { request_id: req.params.requestId, pdf_status: req.body.status },
  });
});

export const getMfgPdfConnectorJob = asyncHandler(async (req, res) => {
  const job = await readMfgPdf(req.client.client_id, req.params.requestId);
  if (!job)
    return failureResponse(res, {
      code: 2004,
      httpStatus: 404,
      message: "PDF export job not found.",
    });
  return successResponse(res, { data: { request_id: job.request_id, lookup: job.lookup || null } });
});
