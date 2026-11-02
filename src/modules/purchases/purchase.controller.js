import { createVoucherHandlers } from "../../shared/http/voucherHandlers.js";
import { queuePurchaseTransaction, readPurchaseTransaction } from "./purchase.service.js";
import { validatePurchaseRequest } from "./purchase.validator.js";
const types = {
  purchase_order: { field: "purchase_order", label: "Purchase Order" },
  purchase_voucher: { field: "purchase", label: "Purchase Voucher" },
  payment_voucher: { field: "payment", label: "Payment Voucher" },
};
const handlers = Object.fromEntries(Object.entries(types).map(([kind, config]) => [kind, createVoucherHandlers({
  ...config, kind, includeFailureResult: true,
  validate: (body) => validatePurchaseRequest(body, kind),
  queue: (input) => queuePurchaseTransaction(input, kind), read: readPurchaseTransaction,
})]));
export const pushPurchase = (kind) => handlers[kind].push;
export const getPurchaseRequest = (kind) => handlers[kind].getRequest;
