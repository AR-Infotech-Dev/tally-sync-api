import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { successResponse, failureResponse } from "../../shared/utils/apiResponse.js";
import { validateGroupSummary } from "./group-summary.validator.js";
import { requestGroupSummary, readGroupSummary } from "./group-summary.service.js";
import { generateGroupSummaryPdf, groupSummaryPdfFilename } from "./group-summary-pdf.service.js";

const statementHandler = (pdf = false) => asyncHandler(async (req, res) => {
  const errors = validateGroupSummary(req.body);

  if (errors.length) return failureResponse(res, {
    code: 2001,
    httpStatus: 400,
    message: "Invalid group summary request.",
    data: { errors }
  });
  const result = await requestGroupSummary(req.client.client_id, req.body, () => res.destroyed);
  if (result.disconnected) return;
  if (!result.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Group Summary job not found." });
  if (result.timedOut) return failureResponse(res, { code: 2011, httpStatus: 504, message: "Connector did not return the Group Summary before timeout.", data: { request_id: result.requestId } });
  if (result.request.status === "failed") return failureResponse(res, { code: 2012, httpStatus: result.request.tally_result?.lookup_status || 502, message: result.request.error || "group summary lookup failed." });
  const summary = result.request.tally_result?.summary;
  if (!summary) return failureResponse(res, { code: 2012, httpStatus: 502, message: "Connector returned no group summary." });
  if (pdf) {
    const buffer = await generateGroupSummaryPdf({ ...summary, pdf_options: req.body });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${groupSummaryPdfFilename(summary)}"`, "Cache-Control": "no-store" });
    return res.status(200).send(buffer);
  }
  return successResponse(res, { message: "Group summary retrieved from local synced database.", data: { data: summary } });
});

export const getGroupSummary = statementHandler();
export const getGroupSummaryPdf = statementHandler(true);

export const getGroupSummaryStatus = asyncHandler(async (req, res) => {
  const request = await readGroupSummary(req.client.client_id, req.params.requestId);
  if (!request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Group Summary job not found." });
  return successResponse(res, { data: { request_id: request.request_id, status: request.status, ...(request.error ? { error: request.error } : {}), ...(request.tally_result?.summary ? { summary: request.tally_result.summary } : {}) } });
});
