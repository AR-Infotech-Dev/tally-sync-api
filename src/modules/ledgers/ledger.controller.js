import { createReportHandlers } from "../../shared/http/reportHandlers.js";
import { validateLedgerStatement } from "./ledger.validator.js";
import { requestLedgerStatement, readLedgerStatement } from "./ledger.service.js";
import { generateLedgerStatementPdf, ledgerPdfFilename } from "./ledger-pdf.service.js";

const handlers = createReportHandlers({
  label: "ledger statement",
  validate: validateLedgerStatement,
  request: requestLedgerStatement,
  read: readLedgerStatement,
  resultKey: "statement",
  generatePdf: generateLedgerStatementPdf,
  filename: ledgerPdfFilename,
  allowFormatQuery: true,
  messages: {
    notFound: "Ledger statement job not found.",
    failure: "Ledger statement lookup failed.",
    success: "Ledger statement retrieved from local synced database.",
  },
});
export const getLedgerStatement = handlers.json;
export const getLedgerStatementPdf = handlers.pdf;
export const getLedgerStatementStatus = handlers.status;
