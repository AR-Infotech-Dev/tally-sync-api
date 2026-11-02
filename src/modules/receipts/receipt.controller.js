import { createVoucherHandlers } from "../../shared/http/voucherHandlers.js";
import { queueReceiptVoucher, readReceiptVoucher } from "./receipt.service.js";
import { validateReceiptVoucherRequest } from "./receipt.validator.js";
const handlers = createVoucherHandlers({
  label: "Receipt Voucher",
  field: "receipt",
  kind: "receipt_voucher",
  validate: validateReceiptVoucherRequest,
  queue: queueReceiptVoucher,
  read: readReceiptVoucher,
  allowOrderNumber: false,
});
export const pushReceiptVoucher = handlers.push;
export const getReceiptVoucherRequest = handlers.getRequest;
