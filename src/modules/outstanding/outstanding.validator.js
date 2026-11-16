import { isIsoDate } from "../../shared/utils/dateValidation.js";

export function validateOutstanding(body = {}) {
  const errors = [];
  if (!body?.company_id) errors.push({ field: "company_id", message: "company_id is required." });
  if (!body?.ledger_name && !body?.dealer_code)
    errors.push({ field: "ledger_name", message: "ledger_name or dealer_code is required." });
  return errors;
}

export function validateOutstandingTotal(body = {}) {
  const errors = validateOutstanding(body);
  if (body?.to_date !== undefined && !isIsoDate(body.to_date, { bounded: true }))
    errors.push({ field: "to_date", message: "Use a valid YYYY-MM-DD date between 1900 and 2099." });
  return errors;
}
