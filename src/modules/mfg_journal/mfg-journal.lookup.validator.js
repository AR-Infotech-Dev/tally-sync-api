import { isIsoDate } from "../../shared/utils/dateValidation.js";
export function validateMfgPdfLookup(input = {}) {
  const errors = [];
  for (const key of ["company_id", "voucher_type", "voucher_no"]) {
    if (
      typeof input[key] !== "string" ||
      !input[key].trim() ||
      input[key].length > 500 ||
      /[\x00-\x1f]/.test(input[key])
    )
      errors.push({ field: key, message: `${key} must be non-empty text up to 500 characters.` });
  }
  if (input.voucher_date !== undefined && !isIsoDate(input.voucher_date))
    errors.push({ field: "voucher_date", message: "Use a real date in YYYY-MM-DD format." });
  return {
    errors,
    lookup: {
      companyId: input.company_id,
      voucherType: input.voucher_type,
      voucherNumber: input.voucher_no,
      voucherDate: input.voucher_date,
    },
  };
}
