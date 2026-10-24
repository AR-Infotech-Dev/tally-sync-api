const money = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balance = (value) => `${money(value?.amount)}${value?.type ? ` ${value.type}` : ""}`;
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value.split("-").reverse().join("-") : String(value || "-");

export function buildLedgerPdfData(statement) {
  return { company: statement.company, ledger_name: statement.ledger_name,
    from_date: date(statement.from_date), to_date: date(statement.to_date),
    opening_balance: balance(statement.opening_balance), closing_balance: balance(statement.closing_balance),
    total_debit: money(statement.total_debit), total_credit: money(statement.total_credit),
    last_synced_at: statement.last_synced_at || "Not available", is_stale: Boolean(statement.is_stale),
    entries: (statement.entries || []).map((entry) => ({ date: date(entry.date), voucher_no: entry.voucher_no || "-", voucher_type: entry.voucher_type,
      particulars: Array.isArray(entry.particulars) ? entry.particulars.join(", ") : entry.particulars || "", narration: entry.narration || "",
      debit: entry.debit ? money(entry.debit) : "-", credit: entry.credit ? money(entry.credit) : "-", balance: balance(entry.balance) })) };
}
