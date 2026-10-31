import { normalizeLedgerPdfOptions } from "./ledger-pdf.options.js";

export function validateLedgerStatement(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) return [{ field: "body", message: "A JSON object is required." }];
  if (typeof body.company_id !== "string" || !body.company_id.trim()) errors.push({ field: "company_id", message: "A valid company_id is required." });
  const identityFields = ["dealer_code", "ledger_name"].filter((field) => body[field] !== undefined);
  if (!identityFields.length) errors.push({ field: "dealer_code", message: "dealer_code or ledger_name is required." });
  for (const field of [...identityFields, "from_date", "to_date", ...(body.company !== undefined ? ["company"] : []), ...(body.company_id !== undefined ? ["company_id"] : [])]) {
    const value = body[field];
    if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\x00-\x1f]/.test(value)) errors.push({ field, message: `${field} must be a non-empty string.` });
  }
  for (const field of ["from_date", "to_date"]) {
    const value = body[field];
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value || value < "1900-01-01" || value > "2099-12-31") errors.push({ field, message: "Use a valid YYYY-MM-DD date between 1900 and 2099." });
  }
  if (!errors.length && body.from_date > body.to_date) errors.push({ field: "to_date", message: "to_date must be on or after from_date." });
  try { normalizeLedgerPdfOptions(body); } catch (error) { errors.push({ field: error.field || "is_detailed", message: error.message }); }
  return errors;
}
