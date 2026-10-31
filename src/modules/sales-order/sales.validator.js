import {validateOrderDueDates} from '../../shared/utils/orderDueDate.js';
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateSalesOrderRequest(body = {}) {
  const errors = [];
  if (!isObject(body.destination) || typeof body.destination.company_id !== "string" || !body.destination.company_id.trim()) {
    errors.push({ field: "destination.company_id", message: "A valid Tally company_id is required." });
  }
  if (!isObject(body.sales_order) || Object.keys(body.sales_order).length === 0) {
    errors.push({ field: "sales_order", message: "Sales order data must be a non-empty JSON object." });
  }
  if (body.idempotency_key !== undefined && (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200)) {
    errors.push({ field: "idempotency_key", message: "idempotency_key must be a string of at most 200 characters." });
  }
  if(isObject(body.sales_order)) errors.push(...validateOrderDueDates(body.sales_order,'sales_order'));
  return errors;
}
