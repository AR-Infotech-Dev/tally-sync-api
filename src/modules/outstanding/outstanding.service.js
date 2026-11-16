import {
  requestConnectorReport,
  readConnectorReport,
} from "../connector-jobs/connector-job.service.js";

export function requestOutstanding(clientId, input, shouldStop) {
  const lookup = { ...input, total_only: false };
  return requestConnectorReport(clientId, lookup, "outstanding", shouldStop);
}

export async function requestOutstandingTotal(clientId, input, shouldStop) {
  const lookup = { ...input, total_only: true };
  const result = await requestConnectorReport(clientId, lookup, "outstanding", shouldStop);
  const report = result.request?.tally_result?.outstanding;
  if (report && Object.hasOwn(report, "bills"))
    throw Object.assign(new Error("Update the Connector to retrieve the ledger outstanding total."), {
      apiCode: 2012,
      status: 409,
    });
  return result;
}

export const readOutstanding = (clientId, requestId) =>
  readConnectorReport(clientId, requestId, "outstanding");
