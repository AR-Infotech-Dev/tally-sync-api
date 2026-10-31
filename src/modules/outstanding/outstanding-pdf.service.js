import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { buildOutstandingAmounts } from "./outstanding-pdf.utils.js";
import { renderHtmlPdf } from "../../shared/utils/htmlPdf.js";
const money = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const displayDate = (value) => { const raw = String(value || "").trim(); const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/) || raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/); if (!match) return raw || "-"; const y = match[1].length === 4 ? match[1] : match[3]; const m = match[2]; const d = match[1].length === 4 ? match[3] : match[1]; return `${d}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]}-${y.slice(2)}`; };

export async function generateOutstandingPdf(report) {
  const template = await readFile(new URL("../../templates/outstanding.hbs", import.meta.url), "utf8");
  const options = report.pdf_options || {};
  const details = report.company_details || {};
  const addressLines = (Array.isArray(details.address) ? details.address : details.address ? [details.address] : []).map((line) => String(line).trim()).filter(Boolean);
  const pincode = String(details.pincode || "").trim();
  if (pincode && !addressLines.some((line) => line.includes(pincode))) addressLines.push(pincode);
  report = { ...report, company_address: options.show_company_address === "no" ? "" : [...new Set(addressLines)].join(", ") || report.company_address, company_email: details.email || report.company_email, company_phone: details.phone || report.company_phone };
  const flags = { show_company_name: options.show_company_name !== "no", show_opening_amount: options.show_opening_amount !== "no", show_pending_amount: options.show_pending_amount !== "no", show_due_date: options.show_due_on !== "no" && options.show_due_date !== "no", show_overdue_days: options.show_no_of_days_till_due_date === "yes" || options.show_overdue_days === "yes", show_narrations: options.show_narrations === "yes", show_order_number: options.show_order_number_details === "yes", show_inventory: options.show_inventory_details === "yes" };
  const amounts = buildOutstandingAmounts(report.bills);
  const bills = amounts.bills.map((row) => ({ ...row, amount: money(row.amount), due_date: displayDate(row.due_date), overdue_days: row.overdue_days ?? row.days_till_due_date ?? 0, narration: row.narration || "", order_number: row.order_number || "" }));
  const widths = [55, "*"]; if (flags.show_opening_amount) widths.push(90); if (flags.show_pending_amount) widths.push(90); if (flags.show_due_date) widths.push(65); if (flags.show_overdue_days) widths.push(60);
  const html = Handlebars.compile(template)({ ...report, ...flags, from_date: displayDate(report.from_date), as_of_date: displayDate(report.as_of_date), report_type_label: options.report_type || "Ledger Outstanding", type_of_bills_label: options.type_of_bills || "Pending Bills", table_widths: JSON.stringify(widths), bills, total: amounts.total, total_opening: amounts.total_opening });
  return renderHtmlPdf(html);
}
