import { emitToConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { getSalesPdf, queueSalesPdf, findPendingSalesPdfs } from "./sales-pdf.model.js";
import { readSalesVoucher } from "./sales.service.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";
import { createHash } from "node:crypto";
import { assertConnectorAvailable } from "../connectors/connectorAvailability.service.js";

export async function requestSalesVoucherPdfByNumber(clientId, company, voucherNumber, options) {
  const lookup = { company, ledger_name: options.partyLedger, voucher_no: voucherNumber, ...(options.voucherDate ? { voucher_date: options.voucherDate } : {}) };
  // Stable cache key; callers always use the Tally fields rather than a stored import ID.
  const requestId = `tally-pdf-${createHash("sha256").update(JSON.stringify([clientId, lookup])).digest("hex")}`;
  const existing = await getSalesPdf(clientId, requestId);
  if (existing?.status === "ready") return { pdf: existing, requestId };
  if (existing?.status === "failed" && !options.retry) return { job: existing, requestId };
  await assertConnectorAvailable(clientId);
  const job = await queueSalesPdf(clientId, requestId, lookup);
  const connectorNotified = job.status === "queued"
    ? emitToConnector(clientId, SOCKET_EVENTS.salesVoucherPdfExport, { request_id: requestId }) : false;
  return { job, connectorNotified, requestId };
}

export async function requestSalesVoucherPdf(clientId, requestId, { retry = false } = {}) {
  const request = await readSalesVoucher(clientId, requestId);
  
  if (!request || request.transaction_type !== "sales_voucher") return { error: "not_found" };
  if (request.status !== "succeeded") return { error: "not_succeeded", status: request.status };

  const existing = await getSalesPdf(clientId, requestId);
  if (existing?.status === "ready") return { pdf: existing };
  if (existing?.status === "failed" && !retry) return { job: existing, connectorNotified: false };

  await assertConnectorAvailable(clientId);
  const job = await queueSalesPdf(clientId, requestId);
  const connectorNotified = job.status === "queued"
    ? emitToConnector(clientId, SOCKET_EVENTS.salesVoucherPdfExport, { request_id: requestId })
    : false;
  recordConsoleLog("info", "Sales voucher PDF requested", { source: "job", clientId, requestId, connectorNotified, status: job.status });
  return { job, connectorNotified };
}

export async function dispatchPendingSalesVoucherPdfs(clientId, socket) {
  const jobs = await findPendingSalesPdfs(clientId);
  for (const job of jobs) socket.emit(SOCKET_EVENTS.salesVoucherPdfExport, { request_id: job.request_id });
  return jobs.length;
}
