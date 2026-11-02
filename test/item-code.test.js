import test from "node:test";
import assert from "node:assert/strict";
import { validateSalesVoucherRequest } from "../src/modules/sales/sales.validator.js";
import { validateSalesOrderRequest } from "../src/modules/sales-order/sales-order.validator.js";
import { validatePurchaseRequest } from "../src/modules/purchases/purchase.validator.js";
import { validateMovementAnalysis } from "../src/modules/movement-analysis/movement-analysis.validator.js";

test("Code-only items pass Sales, Sales Order, Purchase and Purchase Order validation", () => {
  const voucher = { date: "2026-11-02", order_number: "1", order_due_date: "2026-11-09", party: { dealer_code: "AR-02" }, items: [{ item_code: "00123", quantity: 2, rate: 100, sales_ledger: "Sales", purchase_ledger: "Purchase" }] };
  const destination = { company_id: "COMP_TEST" };
  assert.deepEqual(validateSalesVoucherRequest({ destination, sales: voucher }), []);
  assert.deepEqual(validateSalesOrderRequest({ destination, sales_order: voucher }), []);
  assert.deepEqual(validatePurchaseRequest({ destination, purchase: voucher }, "purchase_voucher"), []);
  assert.deepEqual(validatePurchaseRequest({ destination, purchase_order: voucher }, "purchase_order"), []);
  assert(validateSalesVoucherRequest({ destination, sales: { ...voucher, items: [{ ...voucher.items[0], item_code: "", stock_item: "Name" }] } }).some((error) => error.field === "sales.items[0].item_code"));
});

test("Movement accepts item code or legacy name and rejects blank or numeric codes", () => {
  const input = { company_id: "COMP_TEST", from_date: "2026-04-01", to_date: "2026-11-02" };
  assert.deepEqual(validateMovementAnalysis({ ...input, item_code: "00123" }), []);
  assert.deepEqual(validateMovementAnalysis({ ...input, stock_item: "Laptop" }), []);
  assert(validateMovementAnalysis({ ...input, item_code: 123 }).some((error) => error.field === "item_code"));
  assert(validateMovementAnalysis(input).some((error) => error.field === "stock_item"));
});
