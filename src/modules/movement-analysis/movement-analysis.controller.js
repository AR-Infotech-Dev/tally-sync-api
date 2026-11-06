import { createReportHandlers } from "../../shared/http/reportHandlers.js";
import { validateMovementAnalysis } from "./movement-analysis.validator.js";
import { requestMovementAnalysis } from "./movement-analysis.service.js";
import { generateMovementAnalysisPdf } from "./movement-analysis-pdf.service.js";

const handlers = createReportHandlers({
  label: "Movement Analysis",
  validate: validateMovementAnalysis,
  request: requestMovementAnalysis,
  resultKey: "movement_analysis",
  generatePdf: generateMovementAnalysisPdf,
  filename: (report) =>
    `movement-analysis-${(report.analysis_label || report.stock_item || "report").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)}-${report.from_date}-${report.to_date}.pdf`,
  messages: {
    validation: "Invalid Movement Analysis request.",
    timeout: "Connector did not return Movement Analysis before timeout.",
    failure: "Movement Analysis failed.",
    missingResult: "Connector returned no Movement Analysis report.",
  },
});
export const getStockItemMovementPdf = handlers.pdf;
