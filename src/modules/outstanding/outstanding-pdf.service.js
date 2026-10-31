import Handlebars from "handlebars";
import pdfmake from "pdfmake";
import htmlToPdfmake from "html-to-pdfmake";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const fontRoot = path.join(path.dirname(require.resolve("@fontsource/noto-sans-devanagari/package.json")), "files");
const normal = path.join(fontRoot, "noto-sans-devanagari-latin-400-normal.woff");
const bold = path.join(fontRoot, "noto-sans-devanagari-latin-700-normal.woff");
pdfmake.addFonts({ Statement: { normal, bold, italics: normal, bolditalics: bold } });
pdfmake.addTableLayouts({ ledgerStatement: { defaultBorder: false, hLineWidth: (i, n) => i === 0 || i === 1 || i === n.table.body.length - 1 ? 0.5 : 0, vLineWidth: () => 0, paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3 } });
const money = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export async function generateOutstandingPdf(report) {
  const template = await readFile(new URL("../../templates/outstanding.hbs", import.meta.url), "utf8");
  const options = report.pdf_options || {};
  const flags = { show_company_name: options.show_company_name !== "no", show_opening_amount: options.show_opening_amount !== "no", show_pending_amount: options.show_pending_amount !== "no", show_due_date: options.show_due_date !== "no", show_overdue_days: options.show_overdue_days !== "no" };
  const bills = (report.bills || []).map((row) => ({ ...row, opening_amount: money(row.opening_amount ?? row.amount), pending_amount: money(row.pending_amount ?? row.amount), amount: money(row.amount), due_date: row.due_date || "-", overdue_days: row.overdue_days ?? 0 }));
  const widths = [55, "*"]; if (flags.show_opening_amount) widths.push(90); if (flags.show_pending_amount) widths.push(90); if (flags.show_due_date) widths.push(65); if (flags.show_overdue_days) widths.push(60);
  const html = Handlebars.compile(template)({ ...report, ...flags, table_widths: JSON.stringify(widths), bills, total: money(report.total), total_opening: money(report.total_opening ?? report.total) });
  const { window } = new JSDOM("");
  try { const content = htmlToPdfmake(html, { window, removeExtraBlanks: true, defaultStyles: { th: { bold: true, fillColor: "#ffffff" } } }); const table = content.find((node) => node?.table); if (table?.table?.body?.[0]) table.table.body[0].forEach((cell) => { if (cell && typeof cell === "object") { cell.border = [false, true, false, true]; cell.fillColor = "#ffffff"; } }); return Buffer.from(await pdfmake.createPdf({ pageSize: "A4", pageMargins: [36, 32, 36, 36], defaultStyle: { font: "Statement", fontSize: 9 }, content }).getBuffer()); } finally { window.close(); }
}
