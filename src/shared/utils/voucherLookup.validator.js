import { isVoucherDate } from "./dateValidation.js";
export function validateVoucherLookup(query = {}) {
  const lookup = {
    company: query.company,
    ledgerName: query.ledger_name ?? query.party_ledger,
    voucherNumber: query.voucher_no ?? query.voucher_number,
    voucherDate: query.voucher_date,
  };
  const errors = [];
  for (const [field, value] of Object.entries(lookup)) {
    if (field === "voucherDate" && value === undefined) continue;
    if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\x00-\x1f]/.test(value)) {
      errors.push({ field, message: `${field} must be a non-empty string up to 500 characters.` });
    } else lookup[field] = value.trim();
  }
  if (lookup.voucherDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(lookup.voucherDate) || !isVoucherDate(lookup.voucherDate))) {
    errors.push({ field: "voucher_date", message: "voucher_date must be a real YYYY-MM-DD date." });
  }
  return { lookup, errors };
}

