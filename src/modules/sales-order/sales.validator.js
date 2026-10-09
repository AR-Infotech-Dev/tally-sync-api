const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateSalesOrderRequest(body = {}) {
  const errors = [];
  if (!isObject(body.destination) || Object.keys(body.destination).length === 0) {
    errors.push({ field: "destination", message: "Destination details are required." });
  }
  if (!isObject(body.sales_order) || Object.keys(body.sales_order).length === 0) {
    errors.push({ field: "sales_order", message: "Sales order data must be a non-empty JSON object." });
  }
  if (body.idempotency_key !== undefined && (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200)) {
    errors.push({ field: "idempotency_key", message: "idempotency_key must be a string of at most 200 characters." });
  }
  return errors;
}
