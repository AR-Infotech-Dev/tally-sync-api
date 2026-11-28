import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { renderHtmlPdf } from "../../shared/utils/htmlPdf.js";

const number = (value, decimals = 2) =>
  value === null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: decimals });
const change = (value, decimals = 2) => {
  if (value === null) return "—";
  if (Number(value) === 0) return "No change";
  return `${value < 0 ? "Decrease" : "Increase"} ${number(Math.abs(value), decimals)}`;
};
function comparisonSection(report, title) {
  const available = report.comparison_available !== false;
  return {
    ...report,
    title,
    comparison_available: available,
    period_label: report.companies
      .map(
        (company, index) =>
          `${index === 0 ? "A" : "B"}: ${company.from_date ? company.from_date + " to " + company.to_date : "not covered"}`,
      )
      .join(" | "),
    rows: report.rows.map((row) => ({
      ...row,
      alternate_name:
        row.company_b.stock_item && row.company_b.stock_item !== row.stock_item
          ? row.company_b.stock_item
          : null,
      quantity_a: number(row.company_a.quantity, 9),
      quantity_b: number(row.company_b.quantity, 9),
      unit_a: row.company_a.quantity === null ? null : row.company_a.unit || row.company_b.unit,
      unit_b: row.company_b.quantity === null ? null : row.company_b.unit || row.company_a.unit,
      amount_a: number(row.company_a.amount),
      amount_b: number(row.company_b.amount),
      quantity_delta: change(row.quantity_difference, 9),
      amount_delta: change(row.amount_difference),
    })),
    total_a: available ? number(report.totals[0].amount) : "—",
    total_b: available ? number(report.totals[1].amount) : "—",
    total_delta: change(report.total_amount_difference),
  };
}
export function buildItemSalesComparisonPdfData(report) {
  const summary = comparisonSection(report, "Year-wise comparison");
  const monthly = report.comparison_type === "month-wise";
  return {
    ...summary,
    company_a: report.companies[0].company_name,
    company_b: report.companies[1].company_name,
    comparison_type_label: monthly ? "Month-wise" : "Year-wise",
    is_monthly: monthly,
    sections: monthly
      ? report.months.map((month) => comparisonSection(month, month.label))
      : [summary],
  };
}
export async function generateItemSalesComparisonPdf(report) {
  const template = await readFile(
    new URL("../../templates/item-sales-comparison.hbs", import.meta.url),
    "utf8",
  );
  return renderHtmlPdf(Handlebars.compile(template)(buildItemSalesComparisonPdfData(report)), {
    landscape: true,
  });
}
