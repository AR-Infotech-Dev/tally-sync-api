import { createReportHandlers } from "../../shared/http/reportHandlers.js";
import { validateGroupSummary } from "./group-summary.validator.js";
import { requestGroupSummary, readGroupSummary } from "./group-summary.service.js";
import { generateGroupSummaryPdf, groupSummaryPdfFilename } from "./group-summary-pdf.service.js";

const handlers = createReportHandlers({
  label: "Group Summary",
  validate: validateGroupSummary,
  request: requestGroupSummary,
  read: readGroupSummary,
  resultKey: "summary",
  generatePdf: (summary, body) => generateGroupSummaryPdf({ ...summary, pdf_options: body }),
  filename: groupSummaryPdfFilename,
  messages: {
    validation: "Invalid group summary request.",
    failure: "group summary lookup failed.",
    missingResult: "Connector returned no group summary.",
    success: "Group summary retrieved from local synced database.",
  },
});
export const getGroupSummary = handlers.json;
export const getGroupSummaryPdf = handlers.pdf;
export const getGroupSummaryStatus = handlers.status;
