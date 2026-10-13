const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function isValidDate(value) {
  if (typeof value !== "string") return false;
  const input = value.trim();
  let year;
  let month;
  let day;
  let match;
  if ((match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)) || (match = input.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    [, year, month, day] = match;
  } else if ((match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [, day, month, year] = match;
    if (year.length === 2) year = `20${year}`;
  } else return false;

  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day);
}

export function validateReceiptVoucherRequest(input = {}) {
  const body = isObject(input) ? input : {};
  const errors = [];
  const receipt = body.receipt;

  if (!isObject(body.destination) || !(body.destination.company || body.destination.company_name)) {
    errors.push({ field: "destination.company", message: "Tally company name is required." });
  }
  if (!isObject(receipt) || Object.keys(receipt).length === 0) {
    errors.push({ field: "receipt", message: "Receipt voucher data must be a non-empty JSON object." });
    return errors;
  }

  const date = receipt.date || receipt.voucher_date;
  if (!isValidDate(date)) {
    errors.push({ field: "receipt.date", message: "A valid voucher date is required. Use YYYY-MM-DD, YYYYMMDD, or DD-MM-YYYY." });
  }
  if (!(receipt.party?.ledger_name || receipt.party_ledger)) {
    errors.push({ field: "receipt.party.ledger_name", message: "Customer ledger name is required." });
  }
  if (!(receipt.payment?.ledger_name || receipt.payment_ledger)) {
    errors.push({ field: "receipt.payment.ledger_name", message: "Cash or bank ledger name is required." });
  }
  const amount = Number(receipt.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push({ field: "receipt.amount", message: "Receipt amount must be greater than zero." });
  }
  if (receipt.bill_reference !== undefined && (typeof receipt.bill_reference !== "string" || !receipt.bill_reference.trim())) {
    errors.push({ field: "receipt.bill_reference", message: "bill_reference must be a non-empty string when provided." });
  }
  if (receipt.custom_fields !== undefined && !isObject(receipt.custom_fields)) {
    errors.push({ field: "receipt.custom_fields", message: "custom_fields must be a JSON object." });
  }
  if (body.idempotency_key !== undefined && (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200)) {
    errors.push({ field: "idempotency_key", message: "idempotency_key must be a string of at most 200 characters." });
  }

  return errors;
}
