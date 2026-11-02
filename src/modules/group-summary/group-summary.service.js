import { requestConnectorReport, readConnectorReport } from "../connector-jobs/connector-job.service.js";

export function requestGroupSummary(clientId, input, shouldStop) {
  const lookup = { group: input.group.trim(), from_date: input.from_date, to_date: input.to_date, ...(input.company ? { company: input.company.trim() } : {}), ...(input.company_id ? { company_id: input.company_id.trim() } : {}) };
  return requestConnectorReport(clientId, lookup, "group_summary", shouldStop);
}

export const readGroupSummary = (clientId, requestId) => readConnectorReport(clientId, requestId, "group_summary");
