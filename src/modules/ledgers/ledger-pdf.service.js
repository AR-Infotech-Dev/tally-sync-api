import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { buildLedgerPdfData } from "./ledger-pdf.utils.js";
import { renderHtmlPdf } from "../../shared/utils/htmlPdf.js";
const handlebars = Handlebars.create();

export function ledgerPdfFilename(statement) {
  const ledger = String(statement.ledger_name || "ledger").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `statement-${ledger}-${statement.from_date}-${statement.to_date}.pdf`;
}

export async function renderLedgerStatementHtml(statement, options = {}) {
  const template = await readFile(new URL("../../templates/ledger-statement.hbs", import.meta.url), "utf8");
  return handlebars.compile(template)(buildLedgerPdfData(statement, options));
}

export async function generateLedgerStatementPdf(statement, options = {}) {
  return renderHtmlPdf(await renderLedgerStatementHtml(statement, options));
}
