import { createReportHandlers } from "../../shared/http/reportHandlers.js";
import { validateItemSalesComparison } from "./item-sales-comparison.validator.js";
import { requestItemSalesComparison } from "./item-sales-comparison.service.js";
import { generateItemSalesComparisonPdf } from "./item-sales-comparison-pdf.service.js";

const handlers = createReportHandlers({
  label: "Item Sales Comparison",
  validate: validateItemSalesComparison,
  request: requestItemSalesComparison,
  resultKey: "comparison",
  generatePdf: generateItemSalesComparisonPdf,
  filename: (report) =>
    `item-sales-${report.comparison_type || "year-wise"}-${report.companies[0].from_date}-${report.companies[0].to_date}-vs-${report.companies[1].from_date}-${report.companies[1].to_date}.pdf`,
  messages: {
    success: "Item sales comparison retrieved.",
    validation: "Invalid item sales comparison request.",
  },
});
export const getItemSalesComparison = handlers.json;
export const getItemSalesComparisonPdf = handlers.pdf;
