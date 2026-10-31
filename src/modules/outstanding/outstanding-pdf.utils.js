const money = (value) => Math.abs(Number(value || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const direction = (row, field) => row[`${field}_direction`] || row.direction || (Number(row[field] ?? row.amount) < 0 ? "Dr" : "Cr");
const amount = (row, field) => Number(row[field] ?? row.amount ?? 0);
const label = (value, side) => `${money(value)}${value && side ? ` ${side}` : ""}`;

export function buildOutstandingAmounts(rows = []) {
  const net = (field) => rows.reduce((sum, row) => sum + Math.round(Math.abs(amount(row, field)) * 100) * (direction(row, field) === "Dr" ? 1 : -1), 0);
  const totalLabel = (cents) => label(cents / 100, cents < 0 ? "Cr" : cents > 0 ? "Dr" : null);
  return {
    bills: rows.map((row) => ({ ...row, is_advance: String(row.type || row.bill_type || "").trim().toLowerCase() === "advance", opening_amount: label(amount(row, "opening_amount"), direction(row, "opening_amount")), pending_amount: label(amount(row, "pending_amount"), direction(row, "pending_amount")) })),
    total_opening: totalLabel(net("opening_amount")),
    total: totalLabel(net("pending_amount")),
  };
}
