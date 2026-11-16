import { requestConnectorReport } from "../connector-jobs/connector-job.service.js";

export function requestGroupList(clientId, input, shouldStop) {
  
  return requestConnectorReport(
    clientId,
    { company_id: input.company_id.trim() },
    "group_list",
    shouldStop,
    { timeoutEnv: "GROUP_LIST_RESPONSE_TIMEOUT_MS", timeoutDefault: 60000 },
  );
}

