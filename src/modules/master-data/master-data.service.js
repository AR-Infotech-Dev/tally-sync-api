import { requestConnectorReport } from "../connector-jobs/connector-job.service.js";

export function requestMasterData(clientId, input, catalog, shouldStop) {
  const lookup = { company_id: input.company_id.trim(), catalog };
  for (const field of ["group", "search", "stock_item", "item_code"])
    if (typeof input[field] === "string" && input[field].trim())
      lookup[field] = input[field].trim();
  return requestConnectorReport(clientId, lookup, "master_data", shouldStop, {
    timeoutEnv: "MASTER_DATA_RESPONSE_TIMEOUT_MS",
    timeoutDefault: 60000,
  });
}
