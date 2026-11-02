import { requestConnectorReport, readConnectorReport } from "../connector-jobs/connector-job.service.js";

export function requestOutstanding(clientId, input, shouldStop) {
  const lookup = { ...input, company_id: input.company_id };
  return requestConnectorReport(clientId, lookup, "outstanding", shouldStop);
}

export const readOutstanding = (clientId, requestId) => readConnectorReport(clientId, requestId, "outstanding");
