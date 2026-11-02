import {
  requestConnectorReport,
  readConnectorReport,
} from "../connector-jobs/connector-job.service.js";

export function requestLedgerStatement(clientId, input, shouldStop) {
  const lookup = {
    ...(input.dealer_code ? { dealer_code: input.dealer_code.trim() } : {}),
    ...(input.ledger_name ? { ledger_name: input.ledger_name.trim() } : {}),
    from_date: input.from_date,
    to_date: input.to_date,
    ...(input.company ? { company: input.company.trim() } : {}),
    ...(input.company_id ? { company_id: input.company_id.trim() } : {}),
  };
  return requestConnectorReport(clientId, lookup, "ledger_statement", shouldStop);
}

export const readLedgerStatement = (clientId, requestId) =>
  readConnectorReport(clientId, requestId, "ledger_statement");
