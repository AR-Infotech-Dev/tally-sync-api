import { emitToConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { createSalesOrderRequest, getSalesOrderRequest, updateSalesOrderRequest } from "./sales.model.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";
import { assertConnectorAvailable, assertConnectorConnected, assertNoAvailabilityFailure } from "../connectors/connectorAvailability.service.js";

function notifyConnector(request) {
  if (["ledger_statement", "group_summary", "outstanding"].includes(request.transaction_type)) return emitToConnector(request.client_id, SOCKET_EVENTS.ledgerStatementFetch, { request_id: request.request_id, transaction_type: request.transaction_type });
  if (["sales_order_lookup", "sales_voucher_lookup"].includes(request.transaction_type)) return emitToConnector(request.client_id, SOCKET_EVENTS.salesOrderFetch, { request_id: request.request_id });
  const isSalesVoucher = request.transaction_type === "sales_voucher";
  const isReceiptVoucher = request.transaction_type === "receipt_voucher";
  const isPurchaseOrder = request.transaction_type === "purchase_order";
  const isPurchaseVoucher = request.transaction_type === "purchase_voucher";
  const isPaymentVoucher = request.transaction_type === "payment_voucher";
  const event = isReceiptVoucher
    ? SOCKET_EVENTS.receiptVoucherPush
    : isSalesVoucher ? SOCKET_EVENTS.salesVoucherPush
      : isPurchaseOrder ? SOCKET_EVENTS.purchaseOrderPush
        : isPurchaseVoucher ? SOCKET_EVENTS.purchaseVoucherPush
          : isPaymentVoucher ? SOCKET_EVENTS.paymentVoucherPush : SOCKET_EVENTS.salesOrderPush;
  return emitToConnector(request.client_id, event, {
    request_id: request.request_id,
    action: isReceiptVoucher ? "receipt.push" : isSalesVoucher ? "sales.push"
      : isPurchaseOrder ? "purchase_order.push" : isPurchaseVoucher ? "purchase.push"
        : isPaymentVoucher ? "payment.push" : "sales_order.push",
  });
}

export async function queueSalesOrder(input) {
  await assertConnectorAvailable(input.client_id, { requireTally: !["ledger_statement", "group_summary", "outstanding"].includes(input.transaction_type) });
  const result = await createSalesOrderRequest(input);
  const connectorNotified = result.request.status === "queued" ? notifyConnector(result.request) : false;
  const transactionLabel = result.request.transaction_type === "receipt_voucher"
    ? "Receipt Voucher"
    : result.request.transaction_type === "sales_voucher" ? "Sales Voucher"
      : result.request.transaction_type === "purchase_order" ? "Purchase Order"
        : result.request.transaction_type === "purchase_voucher" ? "Purchase Voucher"
          : result.request.transaction_type === "payment_voucher" ? "Payment Voucher" : "Sales Order";
  recordConsoleLog("info", result.duplicate ? `Duplicate ${transactionLabel.toLowerCase()} request received` : `${transactionLabel} request queued`, {
    source: "job",
    clientId: result.request.client_id,
    requestId: result.request.request_id,
    connectorNotified,
    status: result.request.status,
  });
  return {
    request: result.request,
    duplicate: result.duplicate,
    connectorNotified,
  };
}

export async function readSalesOrder(clientId, requestId) {
  return getSalesOrderRequest(clientId, requestId);
}

/** Waits for the Connector's persisted terminal result before completing a CRM push request. */
export async function waitForSalesOrderCompletion(clientId, requestId, {
  timeoutMs = Number(process.env.CONNECTOR_RESPONSE_TIMEOUT_MS) || 120_000,
  pollIntervalMs = 500,
  shouldStop = () => false,
} = {}) {
  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  let request;

  while (Date.now() < deadline) {
    if (shouldStop()) return { request, disconnected: true };
    request = await getSalesOrderRequest(clientId, requestId);
    if (!request || request.status === "succeeded" || request.status === "failed") {
      assertNoAvailabilityFailure(request);
      return { request, timedOut: false };
    }
    assertConnectorConnected(clientId, { request_id: requestId, status: request.status });
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))));
  }

  request = await getSalesOrderRequest(clientId, requestId);
  assertNoAvailabilityFailure(request);
  if (request && !["succeeded", "failed"].includes(request.status)) assertConnectorConnected(clientId, { request_id: requestId, status: request.status });
  return { request, timedOut: !request || !["succeeded", "failed"].includes(request.status) };
}

export async function recordSalesOrderResult(clientId, requestId, update) {
  return updateSalesOrderRequest(clientId, requestId, update);
}
