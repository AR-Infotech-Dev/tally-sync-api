import Handlebars from "handlebars";
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";
import { resolvePdfBrowser } from './pdf-browser.service.js';
import { createRequire } from "node:module";
import path from "node:path";
import { buildLedgerPdfData } from "./ledger-pdf.utils.js";

const require = createRequire(import.meta.url);
const fontRoot = path.dirname(require.resolve("@fontsource/noto-sans-devanagari/package.json"));
const templateUrl = new URL("../../templates/ledger-statement.hbs", import.meta.url);
const handlebars = Handlebars.create();

export function ledgerPdfFilename(statement) {
  const ledger = String(statement.ledger_name || "ledger").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `statement-${ledger}-${statement.from_date}-${statement.to_date}.pdf`;
}

export async function renderLedgerStatementHtml(statement) {
  const [template, latin, devanagari] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(path.join(fontRoot, "files/noto-sans-devanagari-latin-400-normal.woff")),
    readFile(path.join(fontRoot, "files/noto-sans-devanagari-devanagari-400-normal.woff")),
  ]);
  return handlebars.compile(template)({ ...buildLedgerPdfData(statement), latin_font: latin.toString("base64"), devanagari_font: devanagari.toString("base64") });
}

export async function generateLedgerStatementPdf(statement) {
  const [html, footer] = await Promise.all([renderLedgerStatementHtml(statement), readFile(new URL("../../templates/pdf-footer.hbs", import.meta.url), "utf8")]);
  const browser = await puppeteer.launch({ executablePath: await resolvePdfBrowser(), headless: true, timeout: 30000 });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      // All template assets are embedded; statement contents cannot trigger network requests.
      if (/^(data:|about:)/i.test(request.url())) void request.continue(); else void request.abort();
    });
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: "<span></span>", footerTemplate: handlebars.compile(footer)({}),
      margin: { top: "14mm", right: "12mm", bottom: "17mm", left: "12mm" }, timeout: 30000 }));
  } finally { await browser.close(); }
}
