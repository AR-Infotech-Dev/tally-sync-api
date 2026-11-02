import { createVoucherLookupHandler } from "../../shared/http/voucherLookupHandler.js";
import { createVoucherHandlers } from "../../shared/http/voucherHandlers.js";
import { queueConnectorJob, readConnectorJob } from "../connector-jobs/connector-job.service.js";
import { validateSalesOrderRequest } from "./sales-order.validator.js";

export const getSalesOrderFromTally = createVoucherLookupHandler(
  "sales_order_lookup",
  "Sales Order",
);

const voucherHandlers = createVoucherHandlers({
  label: "Sales Order",
  field: "sales_order",
  validate: validateSalesOrderRequest,
  queue: queueConnectorJob,
  read: readConnectorJob,
  validationMessage: "Invalid sales order request.",
  missingWaitLabel: "Sales order",
  requestLabel: "Sales order",
});
export const pushSalesOrder = voucherHandlers.push;
export const getSalesOrderRequest = voucherHandlers.getRequest;
