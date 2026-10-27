import { normalizeLedgerPdfOptions } from "./ledger-pdf.options.js";
const money = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balance = (value) => `${money(value?.amount)}${value?.type ? ` ${value.type}` : ""}`;
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value.split("-").reverse().join("-") : String(value || "-");
const tallyDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")
  ? `${Number(value.slice(8))}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(value.slice(5,7))-1]}-${value.slice(2,4)}` : date(value);

export function buildLedgerPdfData(statement, options = {}) {
  const display = normalizeLedgerPdfOptions(options);
  const { isDetailed, showInventoryDetails, showBillWiseDetails } = display;
  const opening = statement.opening_balance || {};
  const closing = statement.closing_balance || {};
  const openingDebit = opening.type === "Dr" ? Number(opening.amount) : 0;
  const openingCredit = opening.type === "Cr" ? Number(opening.amount) : 0;
  const subtotalDebit = Math.round((openingDebit + Number(statement.total_debit || 0)) * 100) / 100;
  const subtotalCredit = Math.round((openingCredit + Number(statement.total_credit || 0)) * 100) / 100;
  return { company: statement.company, ledger_name: statement.ledger_name,
    company_address: statement.company_details?.address || [], company_pincode: statement.company_details?.pincode || "", company_email: statement.company_details?.email || "",
    ...display, is_detailed: isDetailed, table_widths: JSON.stringify(display.showVoucherNo ? [49,"*",66,38,70,70] : [49,"*",66,70,70]), column_count: display.showVoucherNo ? 6 : 5, summary_colspan: display.showVoucherNo ? 4 : 3, detail_colspan: display.showVoucherNo ? 3 : 2, format_label: isDetailed ? "Detailed" : "Condensed",
    details_unavailable: (showInventoryDetails || showBillWiseDetails) && (statement.details_available === false || (statement.entries || []).some(entry => (showInventoryDetails && !Array.isArray(entry.inventory_entries)) || (showBillWiseDetails && !Array.isArray(entry.bill_allocations)))),
    bank_details_unavailable: (display.showBankDetails || display.showPaymentReceiptMode) && (statement.entries || []).some(entry => !Array.isArray(entry.bank_allocations)),
    has_opening: Number(opening.amount || 0) !== 0, opening_direction: opening.type === "Dr" ? "To" : "By",
    opening_debit: openingDebit ? money(openingDebit) : "", opening_credit: openingCredit ? money(openingCredit) : "",
    closing_direction: closing.type === "Cr" ? "To" : "By", closing_debit: closing.type === "Cr" ? money(closing.amount) : "", closing_credit: closing.type === "Dr" ? money(closing.amount) : "",
    subtotal_debit: money(subtotalDebit), subtotal_credit: money(subtotalCredit),
    grand_debit: money(subtotalDebit + (closing.type === "Cr" ? Number(closing.amount) : 0)),
    grand_credit: money(subtotalCredit + (closing.type === "Dr" ? Number(closing.amount) : 0)),
    from_date: date(statement.from_date), to_date: date(statement.to_date),
    period_from: tallyDate(statement.from_date), period_to: tallyDate(statement.to_date),
    opening_balance: balance(statement.opening_balance), closing_balance: balance(statement.closing_balance),
    total_debit: money(statement.total_debit), total_credit: money(statement.total_credit),
    last_synced_at: statement.last_synced_at || "Not available", is_stale: Boolean(statement.is_stale),
    entries: (statement.entries || []).map((entry, index, entries) => ({ stripe: display.enableStripeView && index % 2 === 1, payment_modes: display.showPaymentReceiptMode ? [...new Set((entry.bank_allocations || []).map(bank => bank.transaction_type).filter(Boolean))].join(", ") : "", bank_allocations: display.showBankDetails ? (entry.bank_allocations || []) : [], date: date(entry.date), display_date: index && entries[index-1].date === entry.date ? "" : tallyDate(entry.date), voucher_no: entry.voucher_no || "-", voucher_type: entry.voucher_type,
      particulars: Array.isArray(entry.particulars) ? entry.particulars.join(", ") : entry.particulars || "", narration: entry.narration || "",
      primary_particular: Array.isArray(entry.particulars) ? entry.particulars[0] || "" : entry.particulars || "",
      additional_particulars: Array.isArray(entry.particulars) ? entry.particulars.slice(1).join(", ") : "",
      direction: entry.debit && entry.credit ? "To / By" : entry.debit ? "To" : "By",
      debit_display: entry.debit ? money(entry.debit) : "", credit_display: entry.credit ? money(entry.credit) : "",
      inventory_entries: showInventoryDetails ? (entry.inventory_entries || []).map(item => ({ ...item, amount: money(item.amount) })) : [],
      bill_allocations: showBillWiseDetails ? (entry.bill_allocations || []).map(bill => ({ ...bill, amount: money(bill.amount) })) : [],
      debit: entry.debit ? money(entry.debit) : "-", credit: entry.credit ? money(entry.credit) : "-", balance: balance(entry.balance) })) };
}
