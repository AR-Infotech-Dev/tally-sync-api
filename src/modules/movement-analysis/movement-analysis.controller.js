import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse } from "../../shared/utils/apiResponse.js";
import { validateMovementAnalysis } from "./movement-analysis.validator.js";
import { requestMovementAnalysis } from "./movement-analysis.service.js";
import { generateMovementAnalysisPdf } from "./movement-analysis-pdf.service.js";

export const getStockItemMovementPdf = asyncHandler(async (req, res) => {
  const errors = validateMovementAnalysis(req.body);
  if (errors.length) return failureResponse(res, { code: 2001, httpStatus: 400, message: "Invalid Stock Item Movement Analysis request.", data: { errors } });
  const result = await requestMovementAnalysis(req.client.client_id, req.body, () => res.destroyed);
  if (result.disconnected) return;
  if (result.timedOut) return failureResponse(res, { code: 2011, httpStatus: 504, message: "Connector did not return Movement Analysis before timeout.", data: { request_id: result.requestId } });
  if (!result.request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Movement Analysis job not found." });
  if (result.request.status === "failed") return failureResponse(res, { code: 2012, httpStatus: result.request.tally_result?.lookup_status || 502, message: result.request.error || "Movement Analysis failed." });
  const report = result.request.tally_result?.movement_analysis;
  if (!report) return failureResponse(res, { code: 2012, httpStatus: 502, message: "Connector returned no Movement Analysis report." });
  const pdf = await generateMovementAnalysisPdf(report, req.body);
  if (res.destroyed) return;
  const item = report.stock_item.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="movement-analysis-${item}-${report.from_date}-${report.to_date}.pdf"`, "Cache-Control": "no-store" });
  return res.status(200).send(pdf);
});
