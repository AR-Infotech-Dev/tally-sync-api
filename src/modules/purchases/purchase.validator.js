import { isVoucherDate } from "../../shared/utils/dateValidation.js";
import { validateOrderDueDates } from "../../shared/utils/orderDueDate.js";
import { validateItemIdentity } from "../../shared/utils/itemIdentity.js";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validDate = (value) => isVoucherDate(value, { flexibleYearFirst: false });

export function validatePurchaseRequest(body = {}, kind) {
  const config = {
    purchase_order: { field: "purchase_order", label: "Purchase Order", items: true },
    purchase_voucher: { field: "purchase", label: "Purchase", items: true },
    payment_voucher: { field: "payment", label: "Payment", items: false },
  }[kind];
  if (!config) return [{ field: "transaction_type", message: "Unsupported purchase transaction." }];
  const errors = [];
  const voucher = body[config.field];
  if (
    !isObject(body.destination) ||
    typeof body.destination.company_id !== "string" ||
    !body.destination.company_id.trim()
  )
    errors.push({
      field: "destination.company_id",
      message: "A valid Tally company_id is required.",
    });
  if (!isObject(voucher) || Object.keys(voucher).length === 0) {
    errors.push({
      field: config.field,
      message: `${config.label} data must be a non-empty JSON object.`,
    });
    return errors;
  }
  if (!validDate(voucher.date || voucher.voucher_date || voucher.order_date))
    errors.push({
      field: `${config.field}.date`,
      message: "A valid voucher date is required (YYYY-MM-DD, YYYYMMDD, or DD-MM-YYYY).",
    });
  if (!(
    voucher.party?.dealer_code ||
    voucher.dealer_code ||
    voucher.party_dealer_code ||
    voucher.party?.ledger_name ||
    voucher.party_ledger ||
    voucher.supplier_ledger ||
    voucher.supplier_name
  ))
    errors.push({
      field: `${config.field}.party.dealer_code`,
      message: "Supplier dealer_code or ledger_name is required.",
    });
  if (kind === "purchase_order" && !(voucher.order_number || voucher.purchase_order_number))
    errors.push({
      field: "purchase_order.order_number",
      message:
        "Purchase order number is required. This is the supplier-facing order reference, separate from voucher_number.",
    });
  if (kind === "purchase_order") errors.push(...validateOrderDueDates(voucher, "purchase_order"));
  if (config.items) {
    const items = voucher.items || voucher.line_items || voucher.lineItems;
    if (!Array.isArray(items) || items.length === 0)
      errors.push({
        field: `${config.field}.items`,
        message: `${config.label} must contain at least one item.`,
      });
    else
      items.forEach((item, index) => {
        errors.push(...validateItemIdentity(item, `${config.field}.items[${index}]`));
        if (!isObject(item)) return;
        if (
          !Number.isFinite(Number(item.quantity ?? item.qty)) ||
          Number(item.quantity ?? item.qty) <= 0
        )
          errors.push({
            field: `${config.field}.items[${index}].quantity`,
            message: "Quantity must be greater than zero.",
          });
        if (
          !Number.isFinite(Number(item.rate ?? item.unit_rate)) ||
          Number(item.rate ?? item.unit_rate) < 0
        )
          errors.push({
            field: `${config.field}.items[${index}].rate`,
            message: "A valid item rate is required.",
          });
      });
    if (
      kind === "purchase_voucher" &&
      !voucher.purchase_ledger &&
      !items?.some((item) => item?.purchase_ledger)
    )
      errors.push({
        field: "purchase.purchase_ledger",
        message: "Purchase ledger is required at purchase level or on each item.",
      });
  } else {
    if (!(voucher.payment?.ledger_name || voucher.payment_ledger))
      errors.push({
        field: "payment.payment.ledger_name",
        message: "Cash or bank ledger name is required.",
      });
    if (!Number.isFinite(Number(voucher.amount)) || Number(voucher.amount) <= 0)
      errors.push({
        field: "payment.amount",
        message: "Payment amount must be greater than zero.",
      });
  }
  if (
    body.idempotency_key !== undefined &&
    (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200)
  )
    errors.push({
      field: "idempotency_key",
      message: "idempotency_key must be a string of at most 200 characters.",
    });
  return errors;
}
