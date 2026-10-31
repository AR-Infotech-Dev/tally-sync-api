import { createHash, timingSafeEqual } from "node:crypto";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { connectorRoom } from "../../socket/utils/rooms.js";
import { findQueuedSalesOrders, markSalesOrderProcessing, updateSalesOrderRequest } from "../sales-order/sales.model.js";
import { findActiveClient } from "../clients/client.model.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";
import { dispatchPendingSalesVoucherPdfs } from "../sales/sales-pdf.service.js";

async function emitPendingSalesOrders(clientId, socket) {
  const requests = await findQueuedSalesOrders(clientId);
  for (const request of requests) {
    if (["ledger_statement", "group_summary"].includes(request.transaction_type)) {
      socket.emit(SOCKET_EVENTS.ledgerStatementFetch, { request_id: request.request_id, transaction_type: request.transaction_type });
      continue;
    }
    if (["sales_order_lookup", "sales_voucher_lookup"].includes(request.transaction_type)) {
      socket.emit(SOCKET_EVENTS.salesOrderFetch, { request_id: request.request_id });
      continue;
    }
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
    socket.emit(event, {
      request_id: request.request_id,
      action: isReceiptVoucher ? "receipt.push" : isSalesVoucher ? "sales.push"
        : isPurchaseOrder ? "purchase_order.push" : isPurchaseVoucher ? "purchase.push"
          : isPaymentVoucher ? "payment.push" : "sales_order.push",
    });
  }
  if (requests.length) {
    console.info("Queued sales orders sent to connector:", { clientId, count: requests.length });
    recordConsoleLog("info", "Queued sales order signals dispatched", { source: "socket", clientId, count: requests.length });
  }
}

const isValidId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function registerConnectorSocketHandlers(socket) {
  socket.on(SOCKET_EVENTS.connectorRegister, async (payload = {}, acknowledge = () => {}) => {
    const ack = typeof acknowledge === "function" ? acknowledge : () => {};
    const clientId = String(payload.client_id || "");
    const connectorId = String(payload.connector_id || "");

    if (!isValidId(clientId) || !isValidId(connectorId)) {
      ack({
        success: false,
        code: "INVALID_CONNECTOR_REGISTRATION",
        message: "Valid client_id and connector_id are required.",
      });
      return;
    }

    let client;
    try {
      client = await findActiveClient(clientId);
    } catch (error) {
      const cause = error.cause || error;
      const safeMessage = String(cause.message || error.message)
        .replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, "[redacted MongoDB URI]");
      console.error("Connector authentication lookup failed:", {
        name: cause.name || error.name,
        code: cause.code || cause.codeName || "unknown",
        message: safeMessage,
      });
      recordConsoleLog("error", "Connector registration lookup failed", { source: "socket", clientId, socketId: socket.id, code: cause.code || "unknown" });
      ack({ success: false, code: "REGISTRATION_UNAVAILABLE", message: "Connector registration is temporarily unavailable." });
      return;
    }
    const connectorKeyHash = client?.connector_key_hash;
    if (!connectorKeyHash || !/^[a-f0-9]{64}$/i.test(connectorKeyHash) || typeof payload.connector_key !== "string") {
      recordConsoleLog("warn", "Connector registration rejected: invalid client or connector credentials", { source: "socket", clientId, connectorId, socketId: socket.id });
      ack({ success: false, code: "CONNECTOR_UNAUTHORIZED", message: "Invalid connector credentials." });
      return;
    }
    const receivedHash = createHash("sha256").update(payload.connector_key).digest();
    const expectedHash = Buffer.from(connectorKeyHash, "hex");
    if (!timingSafeEqual(receivedHash, expectedHash)) {
      recordConsoleLog("warn", "Connector registration rejected: key did not match", { source: "socket", clientId, connectorId, socketId: socket.id });
      ack({ success: false, code: "CONNECTOR_UNAUTHORIZED", message: "Invalid connector credentials." });
      return;
    }

    if (socket.data.clientId) socket.leave(connectorRoom(socket.data.clientId));
    socket.data.clientId = clientId;
    socket.data.connectorId = connectorId;
    socket.data.registeredAt = new Date().toISOString();
    socket.data.lastSeenAt = socket.data.registeredAt;
    socket.join(connectorRoom(clientId));

    const result = {
      success: true,
      code: "CONNECTOR_REGISTERED",
      client_id: clientId,
      connector_id: connectorId,
      socket_id: socket.id,
      registered_at: socket.data.registeredAt,
    };

    ack(result);
    socket.emit(SOCKET_EVENTS.connectorRegistered, result);
    socket.emit(SOCKET_EVENTS.connectorTest, {
      message: "Test signal from Tally Sync Server.",
      at: new Date().toISOString(),
    });
    emitPendingSalesOrders(clientId, socket)
      .catch((error) => {
        console.error("Could not dispatch queued sales orders:", error.message);
        recordConsoleLog("error", "Could not dispatch queued sales orders", { source: "socket", clientId, connectorId });
      });
    dispatchPendingSalesVoucherPdfs(clientId, socket)
      .then((count) => {
        if (count) recordConsoleLog("info", "Queued Sales Voucher PDF export signals dispatched", { source: "socket", clientId, count });
      })
      .catch((error) => recordConsoleLog("error", "Could not dispatch queued Sales Voucher PDF exports", { source: "socket", clientId, message: error.message }));
    console.info("Connector registered:", { clientId, connectorId, socketId: socket.id });
    recordConsoleLog("success", "Connector registered", { source: "socket", clientId, connectorId, socketId: socket.id });
  });

  socket.on(SOCKET_EVENTS.connectorHeartbeat, (_payload = {}, acknowledge = () => {}) => {
    const ack = typeof acknowledge === "function" ? acknowledge : () => {};
    if (!socket.data.clientId || !socket.data.connectorId) {
      ack({ success: false, code: "CONNECTOR_NOT_REGISTERED" });
      return;
    }

    socket.data.lastSeenAt = new Date().toISOString();
    const result = { success: true, at: socket.data.lastSeenAt };
    ack(result);
    socket.emit(SOCKET_EVENTS.connectorHeartbeatAck, result);
    // Recover queued work if a one-time push signal was missed while this
    // authenticated socket stayed connected.
    emitPendingSalesOrders(socket.data.clientId, socket)
      .catch((error) => {
        console.error("Could not reconcile queued sales orders:", error.message);
        recordConsoleLog("error", "Could not reconcile queued sales orders", {
          source: "socket",
          clientId: socket.data.clientId,
          connectorId: socket.data.connectorId,
        });
      });
    dispatchPendingSalesVoucherPdfs(socket.data.clientId, socket)
      .then((count) => {
        if (count) {
          recordConsoleLog("info", "Queued Sales Voucher PDF export signals redispatched after heartbeat", {
            source: "socket",
            clientId: socket.data.clientId,
            connectorId: socket.data.connectorId,
            count,
          });
        }
      })
      .catch((error) => {
        console.error("Could not reconcile queued Sales Voucher PDF exports:", error.message);
        recordConsoleLog("error", "Could not reconcile queued Sales Voucher PDF exports", {
          source: "socket",
          clientId: socket.data.clientId,
          connectorId: socket.data.connectorId,
          message: error.message,
        });
      });
  });

  socket.on(SOCKET_EVENTS.connectorAck, (payload = {}) => {
    if (!socket.data.clientId) return;
    if ([SOCKET_EVENTS.salesOrderPush, SOCKET_EVENTS.salesVoucherPush, SOCKET_EVENTS.receiptVoucherPush, SOCKET_EVENTS.purchaseOrderPush, SOCKET_EVENTS.purchaseVoucherPush, SOCKET_EVENTS.paymentVoucherPush].includes(payload.event) && typeof payload.request_id === "string") {
      markSalesOrderProcessing(socket.data.clientId, payload.request_id)
        .catch((error) => console.error("Could not mark transaction as processing:", error.message));
    }
    console.info("Connector event ACK:", {
      clientId: socket.data.clientId,
      connectorId: socket.data.connectorId,
      event: payload.event,
      at: payload.at,
    });
    recordConsoleLog("success", "Connector acknowledged server event", {
      source: "socket",
      clientId: socket.data.clientId,
      connectorId: socket.data.connectorId,
      event: payload.event,
      requestId: payload.request_id,
    });
  });

  socket.on(SOCKET_EVENTS.salesOrderUpdate, async (payload = {}) => {
    if (!socket.data.clientId || typeof payload.request_id !== "string") return;
    const allowedStatuses = new Set(["fetching", "building_xml", "pushing", "succeeded", "failed"]);
    if (!allowedStatuses.has(payload.status)) return;
    try {
      await updateSalesOrderRequest(socket.data.clientId, payload.request_id, {
        status: payload.status,
        error: payload.error,
        tally_result: payload.tally_result,
      });
      const transactionLabel = payload.transaction_type === "receipt_voucher"
        ? "Receipt Voucher"
        : payload.transaction_type === "sales_voucher" ? "Sales Voucher"
          : payload.transaction_type === "purchase_order" ? "Purchase Order"
            : payload.transaction_type === "purchase_voucher" ? "Purchase Voucher"
              : payload.transaction_type === "payment_voucher" ? "Payment Voucher" : "Sales Order";
      console.info(`${transactionLabel} job update:`, { clientId: socket.data.clientId, requestId: payload.request_id, status: payload.status });
      recordConsoleLog(payload.status === "failed" ? "error" : payload.status === "succeeded" ? "success" : "info", `${transactionLabel} ${payload.status}`, { source: "job", clientId: socket.data.clientId, requestId: payload.request_id });
    } catch (error) {
      console.error("Could not save sales order result:", error.message);
      recordConsoleLog("error", "Could not save sales order result", { source: "job", clientId: socket.data.clientId, requestId: payload.request_id });
    }
  });
}
