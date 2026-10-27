const flags = {
  show_narrations: 'showNarrations', show_voucher_no: 'showVoucherNo',
  show_bill_wise_details: 'showBillWiseDetails', show_inventory_details: 'showInventoryDetails',
  show_payment_receipt_mode: 'showPaymentReceiptMode', show_bank_details: 'showBankDetails',
  enable_stripe_view: 'enableStripeView',
};
function yesNo(value, field) {
  if (typeof value !== "string" || !["yes", "no"].includes(value.trim().toLowerCase())) {
    const error = new TypeError(field + ' must be "yes" or "no".'); error.field = field; throw error;
  }
  return value.trim().toLowerCase() === "yes";
}
export function normalizeLedgerPdfOptions(input = {}) {
  const legacyDetailed = yesNo(input.is_detailed === undefined ? "no" : input.is_detailed, "is_detailed");
  let isDetailed = legacyDetailed;
  if (input.report_format !== undefined) {
    if (typeof input.report_format !== "string" || !["condensed", "detailed"].includes(input.report_format.trim().toLowerCase())) {
      const error = new TypeError('report_format must be "condensed" or "detailed".'); error.field = "report_format"; throw error;
    }
    isDetailed = input.report_format.trim().toLowerCase() === "detailed";
  }
  const result = { isDetailed };
  for (const [field, key] of Object.entries(flags)) {
    const fallback = field === "show_voucher_no" || (["show_narrations", "show_bill_wise_details", "show_inventory_details"].includes(field) && isDetailed);
    result[key] = input[field] === undefined ? fallback : yesNo(input[field], field);
  }
  return result;
}
