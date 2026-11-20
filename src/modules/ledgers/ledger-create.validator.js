import { ledgerText, validateLedgerFields } from "../../shared/utils/ledgerCreate.contract.js";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export function validateLedgerCreate(body = {}) {
  if (!object(body)) return [{ field: "body", message: "Send a JSON object." }];
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  for (const field of Object.keys(body))
    if (!["idempotency_key", "destination", "ledger"].includes(field))
      add(field, "Unsupported field.");
  if (!ledgerText(body.idempotency_key, 200))
    add("idempotency_key", "A non-empty idempotency_key of at most 200 characters is required.");
  if (!object(body.destination) || !ledgerText(body.destination.company_id, 100))
    add("destination.company_id", "A valid company_id is required.");
  if (object(body.destination))
    for (const field of Object.keys(body.destination))
      if (field !== "company_id")
        add(`destination.${field}`, "Select the destination using company_id only.");
  return errors.concat(validateLedgerFields(body.ledger));
}
