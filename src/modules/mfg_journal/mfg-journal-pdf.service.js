import { emitToConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { getMfgPdf, queueMfgPdf, findPendingMfgPdfs } from "./mfg-journal-pdf.model.js";
import { readMfgJournal } from "./mfg-journal.service.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";
import { createHash } from "node:crypto";
import { assertConnectorAvailable } from "../connectors/connectorAvailability.service.js";
import { resolveRequestCompany } from "../companies/company.service.js";

function mfgPdfLookup(clientId, target, voucherNumber, options) {
  const lookup = {
    ...target,
    voucher_type: options.voucherType || "Stock Journal",
    voucher_no: voucherNumber,
    ...(options.voucherDate ? { voucher_date: options.voucherDate } : {}),
  };
  // Stable cache key; callers always use the Tally fields rather than a stored import ID.
  const requestId = `mfg-pdf-${createHash("sha256")
    .update(JSON.stringify([clientId, lookup]))
    .digest("hex")}`;
  return { lookup, requestId };
}

export function createMfgPdfByNumberRequester({
  resolve = resolveRequestCompany,
  read = getMfgPdf,
  available = assertConnectorAvailable,
  queue = queueMfgPdf,
  emit = emitToConnector,
} = {}) {
  return async (clientId, companyId, voucherNumber, options = {}) => {
    const reference = { company_id: companyId };
    const cachedTarget = await resolve(clientId, reference, { requireLive: false });
    let { lookup, requestId } = mfgPdfLookup(clientId, cachedTarget, voucherNumber, options);
    let existing = await read(clientId, requestId);
    if (existing?.status === "ready") return { pdf: existing, requestId };
    if (existing?.status === "failed" && !options.retry) return { job: existing, requestId };
    // Only generating a new PDF requires live company selection and Tally.
    const liveTarget = await resolve(clientId, reference, { requireLive: true });
    const live = mfgPdfLookup(clientId, liveTarget, voucherNumber, options);
    if (live.requestId !== requestId) {
      ({ lookup, requestId } = live);
      existing = await read(clientId, requestId);
      if (existing?.status === "ready") return { pdf: existing, requestId };
      if (existing?.status === "failed" && !options.retry) return { job: existing, requestId };
    }
    await available(clientId);
    const job = await queue(clientId, requestId, lookup);
    const connectorNotified =
      job.status === "queued"
        ? emit(clientId, SOCKET_EVENTS.mfgJournalPdfExport, { request_id: requestId })
        : false;
    return { job, connectorNotified, requestId };
  };
}
export function requestMfgJournalPdfByNumber(...args) {
  return createMfgPdfByNumberRequester()(...args);
}

export function createMfgPdfRequester({
  readRequest = readMfgJournal,
  readPdf = getMfgPdf,
  resolve = resolveRequestCompany,
  available = assertConnectorAvailable,
  queue = queueMfgPdf,
  emit = emitToConnector,
} = {}) {
  return async (clientId, requestId, { retry = false } = {}) => {
    const request = await readRequest(clientId, requestId);

    if (!request || request.transaction_type !== "mfg_journal") return { error: "not_found" };
    if (request.status !== "succeeded") return { error: "not_succeeded", status: request.status };

    const existing = await readPdf(clientId, requestId);
    if (existing?.status === "ready") return { pdf: existing };
    if (existing?.status === "failed" && !retry) return { job: existing, connectorNotified: false };

    await resolve(clientId, request.destination);
    await available(clientId);
    const job = await queue(clientId, requestId);
    const connectorNotified =
      job.status === "queued"
        ? emit(clientId, SOCKET_EVENTS.mfgJournalPdfExport, { request_id: requestId })
        : false;
    recordConsoleLog("info", "MFG journal PDF requested", {
      source: "job",
      clientId,
      requestId,
      connectorNotified,
      status: job.status,
    });
    return { job, connectorNotified };
  };
}
export const requestMfgJournalPdf = (...args) => createMfgPdfRequester()(...args);

export async function dispatchPendingMfgJournalPdfs(clientId, socket) {
  const jobs = await findPendingMfgPdfs(clientId);
  for (const job of jobs)
    socket.emit(SOCKET_EVENTS.mfgJournalPdfExport, { request_id: job.request_id });
  return jobs.length;
}
