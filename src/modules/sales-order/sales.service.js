import { emitToConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { createSalesOrderRequest, getSalesOrderRequest, updateSalesOrderRequest } from "./sales.model.js";

function notifyConnector(request) {
  return emitToConnector(request.client_id, SOCKET_EVENTS.salesOrderPush, {
    request_id: request.request_id,
    action: "sales_order.push",
  });
}

export async function queueSalesOrder(input) {
  const result = await createSalesOrderRequest(input);
  return {
    request: result.request,
    duplicate: result.duplicate,
    connectorNotified: result.request.status === "queued" ? notifyConnector(result.request) : false,
  };
}

export async function readSalesOrder(clientId, requestId) {
  return getSalesOrderRequest(clientId, requestId);
}

export async function recordSalesOrderResult(clientId, requestId, update) {
  return updateSalesOrderRequest(clientId, requestId, update);
}
