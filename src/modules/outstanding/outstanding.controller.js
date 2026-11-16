import { createReportHandlers } from "../../shared/http/reportHandlers.js";
import {
  requestOutstanding,
  requestOutstandingTotal,
  readOutstanding,
} from "./outstanding.service.js";
import { validateOutstanding, validateOutstandingTotal } from "./outstanding.validator.js";
import { generateOutstandingPdf } from "./outstanding-pdf.service.js";

const handlers = createReportHandlers({
  label: "Outstanding",
  validate: validateOutstanding,
  request: requestOutstanding,
  read: readOutstanding,
  resultKey: "outstanding",
  generatePdf: (report, body) => generateOutstandingPdf({ ...report, pdf_options: body }),
  filename: () => "outstanding.pdf",
  statusDetails: false,
  missingJobCode: 2012,
  missingJobStatus: 502,
  messages: {
    validation: "company_id and ledger_name or dealer_code are required.",
    notFound: "Outstanding lookup failed.",
    statusNotFound: "Outstanding job not found.",
    timeout: "Connector did not return Outstanding report before timeout.",
    failure: "Outstanding lookup failed.",
    success: "Outstanding report retrieved from local synced database.",
  },
});
const totalOptions = {
  label: "Outstanding total",
  validate: validateOutstandingTotal,
  request: requestOutstandingTotal,
  resultKey: "outstanding",
  missingJobCode: 2012,
  missingJobStatus: 502,
};
export const getOutstanding = createReportHandlers({
  ...totalOptions,
  formatJson: ({ total, total_direction }) => ({
    total: total_direction === "Cr" ? -total : total,
  }),
}).json;
export const getOutstandingTotal = createReportHandlers(totalOptions).json;
export const getOutstandingPdf = handlers.pdf;
export const getOutstandingStatus = handlers.status;
