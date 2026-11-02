import { requestConnectorReport } from "../connector-jobs/connector-job.service.js";

export function requestMovementAnalysis(clientId, input, shouldStop) {
  const lookup = {
    company_id: input.company_id.trim(),
    ...(input.item_code !== undefined ? { item_code: input.item_code.trim() } : {}),
    ...(typeof input.stock_item === "string" ? { stock_item: input.stock_item.trim() } : {}),
    from_date: input.from_date,
    to_date: input.to_date,
    movement_type: input.movement_type || "all",
  };
  return requestConnectorReport(clientId, lookup, "stock_item_movement", shouldStop, {
    timeoutEnv: "MOVEMENT_RESPONSE_TIMEOUT_MS",
    timeoutDefault: 60000,
  });
}
