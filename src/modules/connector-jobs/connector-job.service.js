import { emitToConnector } from "../../socket/index.js";
import { createConnectorJob, getConnectorJob } from "./connector-job.model.js";
import { connectorJobSignal, getConnectorJobType } from "./connector-job.registry.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";
import { resolveRequestCompany } from "../companies/company.service.js";
import {
  assertConnectorAvailable,
  assertConnectorConnected,
  assertNoAvailabilityFailure,
} from "../connectors/connectorAvailability.service.js";

export async function queueConnectorJob(input) {
  const type = input.transaction_type || "sales_order";
  const config = getConnectorJobType(type);
  const company = await resolveRequestCompany(input.client_id, input.destination || input.lookup);
  await assertConnectorAvailable(input.client_id, { requireTally: config.requireTally });
  const result = await createConnectorJob({
    ...input,
    destination: { ...input.destination, ...company },
    ...(input.lookup ? { lookup: { ...input.lookup, ...company } } : {}),
    transaction_type: type,
  });
  let connectorNotified = false;
  if (result.request.status === "queued") {
    const signal = connectorJobSignal(result.request);
    connectorNotified = emitToConnector(result.request.client_id, signal.event, signal.payload);
  }
  recordConsoleLog(
    "info",
    result.duplicate
      ? `Duplicate ${config.label.toLowerCase()} request received`
      : `${config.label} request queued`,
    {
      source: "job",
      clientId: result.request.client_id,
      requestId: result.request.request_id,
      connectorNotified,
      status: result.request.status,
    },
  );
  return { request: result.request, duplicate: result.duplicate, connectorNotified };
}

export const readConnectorJob = (clientId, requestId) => getConnectorJob(clientId, requestId);

export async function waitForConnectorJobCompletion(
  clientId,
  requestId,
  {
    timeoutMs = Number(process.env.CONNECTOR_RESPONSE_TIMEOUT_MS) || 120_000,
    pollIntervalMs = 500,
    shouldStop = () => false,
  } = {},
) {
  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  let request;
  while (Date.now() < deadline) {
    if (shouldStop()) return { request, disconnected: true };
    request = await readConnectorJob(clientId, requestId);
    if (!request || request.status === "succeeded" || request.status === "failed") {
      assertNoAvailabilityFailure(request);
      return { request, timedOut: false };
    }
    assertConnectorConnected(clientId, { request_id: requestId, status: request.status });
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))),
    );
  }
  request = await readConnectorJob(clientId, requestId);
  assertNoAvailabilityFailure(request);
  if (request && !["succeeded", "failed"].includes(request.status))
    assertConnectorConnected(clientId, { request_id: requestId, status: request.status });
  return { request, timedOut: !request || !["succeeded", "failed"].includes(request.status) };
}

export async function requestConnectorReport(
  clientId,
  lookup,
  transactionType,
  shouldStop,
  { timeoutEnv = "LEDGER_RESPONSE_TIMEOUT_MS", timeoutDefault = 15000 } = {},
) {
  const destination = {
    ...(lookup.company_id ? { company_id: lookup.company_id } : {}),
    ...(lookup.company ? { company: lookup.company } : {}),
  };
  const result = await queueConnectorJob({
    client_id: clientId,
    transaction_type: transactionType,
    destination,
    lookup,
  });
  const timeoutMs = Math.max(1000, Number(process.env[timeoutEnv]) || timeoutDefault);
  return {
    ...(await waitForConnectorJobCompletion(clientId, result.request.request_id, {
      shouldStop,
      timeoutMs,
    })),
    requestId: result.request.request_id,
  };
}

export async function readConnectorReport(clientId, requestId, transactionType) {
  const request = await readConnectorJob(clientId, requestId);
  return request?.transaction_type === transactionType ? request : null;
}
