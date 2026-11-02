export function validateOutstanding(body = {}) {
  const errors = [];
  if (!body?.company_id) errors.push({ field: "company_id", message: "company_id is required." });
  if (!body?.ledger_name && !body?.dealer_code) errors.push({ field: "ledger_name", message: "ledger_name or dealer_code is required." });
  return errors;
}
