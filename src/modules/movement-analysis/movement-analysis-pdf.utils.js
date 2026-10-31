import { normalizeMovementOptions } from "./movement-analysis.options.js";
const money = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function movementTotals(entries, direction) {
  return [...new Set(entries.map((row) => row.unit))].map((unit) => {
    const items = entries.filter((row) => row.unit === unit);
    const quantity = items.reduce((sum, row) => sum + row[`${direction}_quantity`], 0);
    const cents = items.reduce((sum, row) => sum + Math.round(row[`${direction}_value`] * 100), 0);
    return { quantity: `${Number(quantity.toFixed(4))} ${unit}`, effective_rate: money(cents / 100 / quantity), value: money(cents / 100) };
  });
}
export function buildMovementPdfData(report, input = {}) {
  const options = normalizeMovementOptions(input);
  const widths = ["*"];
  if (options.show_quantity) widths.push(75);
  if (options.show_basic_rate_and_effective_rate) widths.push(70, 75);
  if (options.show_value) widths.push(85);
  const sections = [];
  for (const direction of ["inward", "outward"]) {
    if (report.movement_type !== "all" && report.movement_type !== direction) continue;
    const groups = [];
    const visibleEntries = [];
    for (const [category, title, flag] of [["party", direction === "inward" ? "Suppliers" : "Buyers", direction === "inward" ? "show_suppliers" : "show_buyers"], ["transfer", direction === "inward" ? "Transfers Inward (Production)" : "Transfers Outward (Consumption)", `show_transfers_${direction}`], ["job_work", `Job Work Transfer ${direction === "inward" ? "Inward" : "Outward"}`, `show_job_work_transfer_${direction}`]]) {
      if (!options[flag]) continue;
      const entries = report.rows.filter((row) => (row.category || "party") === category && row[`${direction}_quantity`] > 0);
      if (!entries.length) continue;
      const rows = entries.map((row) => ({ party: row.party, quantity: `${Number(row[`${direction}_quantity`].toFixed(4))} ${row.unit}`, basic_rate: money(row[`${direction}_basic_value`] / row[`${direction}_quantity`]), effective_rate: money(row[`${direction}_rate`]), value: money(row[`${direction}_value`]) }));
      const totals = movementTotals(entries, direction);
      visibleEntries.push(...entries);
      groups.push({ title, rows, totals });
    }
    if (groups.length) sections.push({ title: direction === "inward" ? "Movement Inward:" : "Movement Outward:", groups, totals: movementTotals(visibleEntries, direction) });
  }
  const details = report.company_details || {};
  const company_address = [...new Set([...(details.address || []), details.pincode].filter(Boolean))];
  return { ...report, ...options, company_address, company_phone: details.phone, company_email: details.email, sections, table_widths: JSON.stringify(widths), column_count: widths.length, value_column_count: widths.length - 1 };
}
