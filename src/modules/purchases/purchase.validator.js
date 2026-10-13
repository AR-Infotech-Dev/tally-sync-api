const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validDate(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  let match = text.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})$/);
  let year; let month; let day;
  if (match) [, year, month, day] = match;
  else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [, day, month, year] = match;
    if (year.length === 2) year = `20${year}`;
  } else return false;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
}

export function validatePurchaseRequest(body = {}, kind) {
  const config = {
    purchase_order: { field: "purchase_order", label: "Purchase Order", items: true },
    purchase_voucher: { field: "purchase", label: "Purchase", items: true },
    payment_voucher: { field: "payment", label: "Payment", items: false },
  }[kind];
  if (!config) return [{ field: "transaction_type", message: "Unsupported purchase transaction." }];
  const errors = [];
  const voucher = body[config.field];
  if (!isObject(body.destination) || !(body.destination.company || body.destination.company_name)) errors.push({ field: "destination.company", message: "Tally company name is required." });
  if (!isObject(voucher) || Object.keys(voucher).length === 0) {
    errors.push({ field: config.field, message: `${config.label} data must be a non-empty JSON object.` });
    return errors;
  }
  if (!validDate(voucher.date || voucher.voucher_date || voucher.order_date)) errors.push({ field: `${config.field}.date`, message: "A valid voucher date is required (YYYY-MM-DD, YYYYMMDD, or DD-MM-YYYY)." });
  if (!(voucher.party?.ledger_name || voucher.party_ledger || voucher.supplier_ledger || voucher.supplier_name)) errors.push({ field: `${config.field}.party.ledger_name`, message: "Supplier ledger name is required." });
  if (kind === "purchase_order" && !(voucher.order_number || voucher.purchase_order_number)) errors.push({ field: "purchase_order.order_number", message: "Purchase order number is required. This is the supplier-facing order reference, separate from voucher_number." });
  if (config.items) {
    const items = voucher.items || voucher.line_items || voucher.lineItems;
    if (!Array.isArray(items) || items.length === 0) errors.push({ field: `${config.field}.items`, message: `${config.label} must contain at least one item.` });
    else items.forEach((item, index) => {
      if (!isObject(item) || !(item.stock_item || item.item_name || item.name)) errors.push({ field: `${config.field}.items[${index}].stock_item`, message: "Stock item name is required." });
      if (!Number.isFinite(Number(item.quantity ?? item.qty)) || Number(item.quantity ?? item.qty) <= 0) errors.push({ field: `${config.field}.items[${index}].quantity`, message: "Quantity must be greater than zero." });
      if (!Number.isFinite(Number(item.rate ?? item.unit_rate)) || Number(item.rate ?? item.unit_rate) < 0) errors.push({ field: `${config.field}.items[${index}].rate`, message: "A valid item rate is required." });
    });
    if (kind === "purchase_voucher" && !voucher.purchase_ledger && !items?.some((item) => item?.purchase_ledger)) errors.push({ field: "purchase.purchase_ledger", message: "Purchase ledger is required at purchase level or on each item." });
  } else {
    if (!(voucher.payment?.ledger_name || voucher.payment_ledger)) errors.push({ field: "payment.payment.ledger_name", message: "Cash or bank ledger name is required." });
    if (!Number.isFinite(Number(voucher.amount)) || Number(voucher.amount) <= 0) errors.push({ field: "payment.amount", message: "Payment amount must be greater than zero." });
  }
  if (body.idempotency_key !== undefined && (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200)) errors.push({ field: "idempotency_key", message: "idempotency_key must be a string of at most 200 characters." });
  return errors;
}
