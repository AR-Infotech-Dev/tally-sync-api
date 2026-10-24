import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { successResponse, failureResponse } from "../../shared/utils/apiResponse.js";
import { validateLedgerStatement } from "./ledger.validator.js";
import { requestLedgerStatement, readLedgerStatement } from "./ledger.service.js";
import { generateLedgerStatementPdf, ledgerPdfFilename } from "./ledger-pdf.service.js";

const statementHandler = (pdf = false) => asyncHandler(async (req, res) => {
  const errors = validateLedgerStatement(req.body);
  if (errors.length) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Invalid ledger statement request.", data: { errors } });
  const result = await requestLedgerStatement(req.client.client_id, req.body, () => res.destroyed);
  if (result.disconnected) return;
  if (!result.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Ledger statement job not found." });
  if (result.timedOut) return failureResponse(res, { code: 2011, httpStatus: 504, message: "Connector did not return the ledger statement before timeout.", data: { request_id: result.requestId } });
  if (result.request.status === "failed") return failureResponse(res, { code: 2012, httpStatus: result.request.tally_result?.lookup_status || 502, message: result.request.error || "Ledger statement lookup failed." });
  const statement = result.request.tally_result?.statement;
  if (!statement) return failureResponse(res, { code: 2012, httpStatus: 502, message: "Connector returned no ledger statement." });
  if (pdf || req.query.format === "pdf") {
    const content = await generateLedgerStatementPdf(statement);
    if (res.destroyed) return;
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${ledgerPdfFilename(statement)}"`, "Cache-Control": "no-store" });
    return res.status(200).send(content);
  }
  return successResponse(res, { message: "Ledger statement retrieved from local synced database.", data: { data: statement } });
});

export const getLedgerStatement = statementHandler();
export const getLedgerStatementPdf = statementHandler(true);

export const getLedgerStatementStatus = asyncHandler(async (req, res) => {
  const request = await readLedgerStatement(req.client.client_id, req.params.requestId);
  if (!request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Ledger statement job not found." });
  return successResponse(res, { data: { request_id: request.request_id, status: request.status, ...(request.error ? { error: request.error } : {}), ...(request.tally_result?.statement ? { statement: request.tally_result.statement } : {}) } });
});
