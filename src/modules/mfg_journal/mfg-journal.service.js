import { queueConnectorJob, readConnectorJob } from "../connector-jobs/connector-job.service.js";
import { normalizeMfgJournal } from "./mfg-journal.contract.js";
export { normalizeMfgJournal } from "./mfg-journal.contract.js";
export function queueMfgJournal(input) {
  return queueConnectorJob({
    client_id: input.client_id,
    destination: input.destination,
    transaction_type: "mfg_journal",
    mfg_journal: normalizeMfgJournal(input.mfg_journal),
    idempotency_key: input.idempotency_key ? `mfg-journal:${input.idempotency_key}` : undefined,
  });
}
export const readMfgJournal = (clientId, requestId) => readConnectorJob(clientId, requestId);
