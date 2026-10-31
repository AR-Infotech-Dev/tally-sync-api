import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { buildMovementPdfData } from "./movement-analysis-pdf.utils.js";
import { renderHtmlPdf } from "../../shared/utils/htmlPdf.js";
export async function generateMovementAnalysisPdf(report, options = {}) {
  const template = await readFile(new URL("../../templates/movement-analysis.hbs", import.meta.url), "utf8");
  return renderHtmlPdf(Handlebars.compile(template)(buildMovementPdfData(report, options)));
}
