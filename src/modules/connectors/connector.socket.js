import { createHash, timingSafeEqual } from "node:crypto";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { connectorRoom } from "../../socket/utils/rooms.js";
import { findQueuedSalesOrders, markSalesOrderProcessing, updateSalesOrderRequest } from "../sales-order/sales.model.js";
import { findActiveClient } from "../clients/client.model.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";

async function emitPendingSalesOrders(clientId, socket) {
  const requests = await findQueuedSalesOrders(clientId);
  for (const request of requests) {
    socket.emit(SOCKET_EVENTS.salesOrderPush, {
      request_id: request.request_id,
      action: "sales_order.push",
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
  });

  socket.on(SOCKET_EVENTS.connectorAck, (payload = {}) => {
    if (!socket.data.clientId) return;
    if (payload.event === SOCKET_EVENTS.salesOrderPush && typeof payload.request_id === "string") {
      markSalesOrderProcessing(socket.data.clientId, payload.request_id)
        .catch((error) => console.error("Could not mark sales order as processing:", error.message));
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
      console.info("Sales order job update:", { clientId: socket.data.clientId, requestId: payload.request_id, status: payload.status });
      recordConsoleLog(payload.status === "failed" ? "error" : payload.status === "succeeded" ? "success" : "info", `Sales order ${payload.status}`, { source: "job", clientId: socket.data.clientId, requestId: payload.request_id });
    } catch (error) {
      console.error("Could not save sales order result:", error.message);
      recordConsoleLog("error", "Could not save sales order result", { source: "job", clientId: socket.data.clientId, requestId: payload.request_id });
    }
  });
}
