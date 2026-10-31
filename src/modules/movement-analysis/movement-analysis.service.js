import { queueSalesOrder, waitForSalesOrderCompletion } from "../sales-order/sales.service.js";

export async function requestMovementAnalysis(clientId, input, shouldStop) {
  const lookup = { company_id: input.company_id.trim(), stock_item: input.stock_item.trim(), from_date: input.from_date, to_date: input.to_date, movement_type: input.movement_type || "all" };
  const result = await queueSalesOrder({ client_id: clientId, transaction_type: "stock_item_movement", destination: { company_id: lookup.company_id }, lookup });
  const timeoutMs = Math.max(1000, Number(process.env.MOVEMENT_RESPONSE_TIMEOUT_MS) || 60000);
  return { ...await waitForSalesOrderCompletion(clientId, result.request.request_id, { shouldStop, timeoutMs }), requestId: result.request.request_id };
}
