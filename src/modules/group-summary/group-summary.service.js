import { queueSalesOrder, waitForSalesOrderCompletion, readSalesOrder } from "../sales-order/sales.service.js";

export async function requestGroupSummary(clientId, input, shouldStop) {
  const lookup = { group: input.group.trim(), from_date: input.from_date, to_date: input.to_date, ...(input.company ? { company: input.company.trim() } : {}), ...(input.company_id ? { company_id: input.company_id.trim() } : {}) };
  const result = await queueSalesOrder({ client_id: clientId, transaction_type: "group_summary", destination: { ...(lookup.company_id ? { company_id: lookup.company_id } : {}), ...(lookup.company ? { company: lookup.company } : {}) }, lookup });
  const timeoutMs = Math.max(1000, Number(process.env.LEDGER_RESPONSE_TIMEOUT_MS) || 15000);
  return { ...await waitForSalesOrderCompletion(clientId, result.request.request_id, { shouldStop, timeoutMs }), requestId: result.request.request_id };
}

export async function readGroupSummary(clientId, requestId) {
  const request = await readSalesOrder(clientId, requestId);
  return request?.transaction_type === "group_summary" ? request : null;
}
