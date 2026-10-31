import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { buildGroupSummaryPdfData } from "./group-summary-pdf.utils.js";
import { renderHtmlPdf } from "../../shared/utils/htmlPdf.js";
export function groupSummaryPdfFilename(summary) { const group = String(summary.group || "group-summary").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80); return `group-summary-${group}-${summary.from_date}-${summary.to_date}.pdf`; }
export async function generateGroupSummaryPdf(summary) {
  const template = await readFile(new URL("../../templates/group-summary.hbs", import.meta.url), "utf8");
  const data = buildGroupSummaryPdfData(summary, summary.pdf_options || {});
  console.log(data);
  return renderHtmlPdf(Handlebars.compile(template)(data), { landscape: false, showPageNumber: data.show_page_number });
}
