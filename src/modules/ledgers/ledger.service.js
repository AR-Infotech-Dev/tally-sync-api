import { queueSalesOrder, waitForSalesOrderCompletion, readSalesOrder } from "../sales-order/sales.service.js";

export async function requestLedgerStatement(clientId, input, shouldStop) {
  const lookup = { ...(input.dealer_code ? { dealer_code: input.dealer_code.trim() } : {}), ...(input.ledger_name ? { ledger_name: input.ledger_name.trim() } : {}), from_date: input.from_date, to_date: input.to_date, ...(input.company ? { company: input.company.trim() } : {}), ...(input.company_id ? { company_id: input.company_id.trim() } : {}) };
  const result = await queueSalesOrder({ client_id: clientId, transaction_type: "ledger_statement", destination: { ...(lookup.company_id ? { company_id: lookup.company_id } : {}), ...(lookup.company ? { company: lookup.company } : {}) }, lookup });
  const timeoutMs = Math.max(1000, Number(process.env.LEDGER_RESPONSE_TIMEOUT_MS) || 15000);
  return { ...await waitForSalesOrderCompletion(clientId, result.request.request_id, { shouldStop, timeoutMs }), requestId: result.request.request_id };
}

export async function readLedgerStatement(clientId, requestId) {
  const request = await readSalesOrder(clientId, requestId);
  return request?.transaction_type === "ledger_statement" ? request : null;
}
