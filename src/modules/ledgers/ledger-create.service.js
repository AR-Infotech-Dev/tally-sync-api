import { queueConnectorJob, readConnectorJob } from "../connector-jobs/connector-job.service.js";
import { normalizeLedgerCreate } from "./ledger-create.utils.js";
import { claimConnectorLedgerImport } from "../connector-jobs/connector-job.model.js";

export const claimLedgerCreateImport = claimConnectorLedgerImport;

export const queueLedgerCreate = (input) =>
  queueConnectorJob({
    client_id: input.client_id,
    transaction_type: "ledger_create",
    idempotency_key: input.idempotency_key.trim(),
    destination: { company_id: input.destination.company_id.trim() },
    ledger: normalizeLedgerCreate(input.ledger),
  });
export async function readLedgerCreate(clientId, requestId) {
  const request = await readConnectorJob(clientId, requestId);
  return request?.transaction_type === "ledger_create" ? request : null;
}
