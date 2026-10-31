import Handlebars from "handlebars";
import pdfmake from "pdfmake";
import htmlToPdfmake from "html-to-pdfmake";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { buildGroupSummaryPdfData } from "./group-summary-pdf.utils.js";

const require = createRequire(import.meta.url);
const fontRoot = path.join(path.dirname(require.resolve("@fontsource/noto-sans-devanagari/package.json")), "files");
const fontFiles = new Set();
const fonts = (subset) => { const normal = path.join(fontRoot, `noto-sans-devanagari-${subset}-400-normal.woff`); const bold = path.join(fontRoot, `noto-sans-devanagari-${subset}-700-normal.woff`); fontFiles.add(normal); fontFiles.add(bold); return { normal, bold, italics: normal, bolditalics: bold }; };
pdfmake.addFonts({ Statement: fonts("latin"), StatementDevanagari: fonts("devanagari") });
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((file) => fontFiles.has(path.resolve(file)));
pdfmake.addTableLayouts({ groupSummary: { defaultBorder: false, hLineWidth: (index, node) => index <= 2 || index === node.table.body.length - 1 ? 0.6 : 0, vLineWidth: () => 0.5, paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4 } });
const handlebars = Handlebars.create();

function convertHtml(html) {
  const { window } = new JSDOM("");
  try {
    return htmlToPdfmake(html, { window, removeExtraBlanks: true, defaultStyles: { p: { margin: [0, 0, 0, 2] }, h1: { fontSize: 16, margin: [0, 0, 0, 4] }, th: { bold: true }, table: { margin: [0, 0, 0, 0] } } });
  }
  finally { window.close(); }
}
export function groupSummaryPdfFilename(summary) { const group = String(summary.group || "group-summary").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80); return `group-summary-${group}-${summary.from_date}-${summary.to_date}.pdf`; }
export async function generateGroupSummaryPdf(summary) {
  const template = await readFile(new URL("../../templates/group-summary.hbs", import.meta.url), "utf8");
  const data = buildGroupSummaryPdfData(summary, summary.pdf_options || {});
  const html = handlebars.compile(template)(data);
  const content = convertHtml(html);
  const tableNode = content.find((node) => node?.table);
  if (tableNode?.table?.body) {
    tableNode.table.body.slice(0, 2).forEach((row) => row.forEach((cell) => {
      if (cell && typeof cell === "object") { cell.border = [true, true, true, true]; cell.fillColor = "#ffffff"; }
    }));
  }
  const definition = { pageSize: "A4", pageOrientation: "landscape", pageMargins: [32, 28, 32, 32], info: { title: `${summary.group || "Group"} - Group Summary`, author: summary.company || "" }, defaultStyle: { font: "Statement", fontSize: 9, color: "#111111" }, defaultStyles: { th: { bold: true, fillColor: "#ffffff" } }, content, footer: data.show_page_number ? ((page, pages) => ({ text: `Page ${page} of ${pages}`, alignment: "right", margin: [32, 8, 32, 0], fontSize: 8, color: "#555555" })) : undefined };
  return Buffer.from(await pdfmake.createPdf(definition).getBuffer());
}
