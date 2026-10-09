import { emitToConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { createSalesOrderRequest, getSalesOrderRequest, updateSalesOrderRequest } from "./sales.model.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";

function notifyConnector(request) {
  return emitToConnector(request.client_id, SOCKET_EVENTS.salesOrderPush, {
    request_id: request.request_id,
    action: "sales_order.push",
  });
}

export async function queueSalesOrder(input) {
  const result = await createSalesOrderRequest(input);
  const connectorNotified = result.request.status === "queued" ? notifyConnector(result.request) : false;
  recordConsoleLog("info", result.duplicate ? "Duplicate sales order request received" : "Sales order request queued", {
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

export async function recordSalesOrderResult(clientId, requestId, update) {
  return updateSalesOrderRequest(clientId, requestId, update);
}
