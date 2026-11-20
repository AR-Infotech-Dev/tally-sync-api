const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validText = (value, max, optional = false) =>
  typeof value === "string" &&
  (optional || value.trim().length > 0) &&
  value.trim().length <= max &&
  !/[\u0000-\u001f\u007f\ufffe\uffff]/u.test(value) &&
  value.isWellFormed();


export function validateLedgerCreate(body = {}) {
  const errors  = [];

  const add = (field, message) => errors.push({ field, message });
  if (!object(body)) return [{ field: "body", message: "Send a JSON object." }];
  for (const field of Object.keys(body))
    if (!["idempotency_key", "destination", "ledger"].includes(field))
      add(field, "Unsupported field.");
  if (!validText(body.idempotency_key, 200))
    add("idempotency_key", "A non-empty idempotency_key of at most 200 characters is required.");
  if (!object(body.destination) || !validText(body.destination.company_id, 100))
    add("destination.company_id", "A valid company_id is required.");
  if (object(body.destination))
    for (const field of Object.keys(body.destination))
      if (field !== "company_id")
        add(`destination.${field}`, "Select the destination using company_id only.");
  if (!object(body.ledger)) {
    add("ledger", "Ledger data must be an object.");
    return errors;
  }
  for (const field of Object.keys(body.ledger))
    if (!["name", "parent", "dealer_code", "bill_wise"].includes(field))
      add(`ledger.${field}`, "Unsupported ledger field.");
  if (!validText(body.ledger.name, 255))
    add(
      "ledger.name",
      "Ledger name is required, up to 255 characters, without control characters.",
    );
  if (!validText(body.ledger.parent, 255))
    add("ledger.parent", "An existing Tally parent group is required, up to 255 characters.");
  if (body.ledger.dealer_code !== undefined && !validText(body.ledger.dealer_code, 200, true))
    add("ledger.dealer_code", "dealer_code must be a string of at most 200 characters.");
  if (body.ledger.bill_wise !== undefined && typeof body.ledger.bill_wise !== "boolean")
    add("ledger.bill_wise", "bill_wise must be true or false.");
  return errors;
}
