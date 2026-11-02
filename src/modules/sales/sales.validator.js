import { isVoucherDate } from "../../shared/utils/dateValidation.js";
import { validateItemIdentity } from "../../shared/utils/itemIdentity.js";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);



function getPartyLedger(sales) {
  return sales.party?.dealer_code
    || sales.dealer_code
    || sales.party_dealer_code
    || sales.party_ledger
    || sales.party_name
    || sales.customer_ledger
    || sales.customer_name
    || sales.party?.ledger_name
    || sales.party_ledger_entry?.ledger;
}

export function validateSalesVoucherRequest(input = {}) {
  const body = isObject(input) ? input : {};
  const errors = [];
  const sales = body.sales;

  if (!isObject(body.destination) || typeof body.destination.company_id !== "string" || !body.destination.company_id.trim()) {
    errors.push({ field: "destination.company_id", message: "A valid Tally company_id is required." });
  }
  if (!isObject(sales) || Object.keys(sales).length === 0) {
    errors.push({ field: "sales", message: "Sales voucher data must be a non-empty JSON object." });
    return errors;
  }

  const date = sales.date || sales.voucher_date;
  if (!isVoucherDate(date)) {
    errors.push({ field: "sales.date", message: "A valid voucher date is required. Use YYYY-MM-DD, YYYYMMDD, or DD-MM-YYYY." });
  }
  if (!getPartyLedger(sales)) {
    errors.push({ field: "sales.party.dealer_code", message: "Customer dealer_code or ledger_name is required." });
  }
  if (sales.total_amount !== undefined && (!Number.isFinite(Number(sales.total_amount)) || Number(sales.total_amount) < 0)) {
    errors.push({ field: "sales.total_amount", message: "Total amount must be a zero or positive number." });
  }
  if (sales.party_ledger_entry?.amount !== undefined && !Number.isFinite(Number(sales.party_ledger_entry.amount))) {
    errors.push({ field: "sales.party_ledger_entry.amount", message: "Party ledger amount must be a number." });
  }

  const items = sales.items || sales.line_items || sales.lineItems;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push({ field: "sales.items", message: "At least one sales item is required." });
  } else {
    items.forEach((item, index) => {
      const field = `sales.items[${index}]`;
      if (!isObject(item)) {
        errors.push({ field, message: "Each item must be a JSON object." });
        return;
      }
      errors.push(...validateItemIdentity(item, field));
      if (!(item.sales_ledger || sales.sales_ledger)) {
        errors.push({ field: `${field}.sales_ledger`, message: "Sales ledger is required on the item or sales voucher." });
      }
      const quantity = Number(item.quantity ?? item.qty);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push({ field: `${field}.quantity`, message: "Quantity must be greater than zero." });
      }
      const rate = Number(item.rate ?? item.unit_rate);
      if (!Number.isFinite(rate) || rate < 0) {
        errors.push({ field: `${field}.rate`, message: "Rate must be zero or greater." });
      }
      if (item.amount !== undefined && !Number.isFinite(Number(item.amount))) {
        errors.push({ field: `${field}.amount`, message: "Amount must be a number." });
      }
    });
  }

  if (body.idempotency_key !== undefined && (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200)) {
    errors.push({ field: "idempotency_key", message: "idempotency_key must be a string of at most 200 characters." });
  }

  return errors;
}
