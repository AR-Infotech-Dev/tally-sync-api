import { requestConnectorReport } from "../connector-jobs/connector-job.service.js";
import { resolveRequestCompany } from "../companies/company.service.js";
import {
  buildItemSalesComparison,
  comparisonError,
  comparisonMatchBy,
} from "./item-sales-comparison.utils.js";
import { comparisonPeriods } from "./item-sales-comparison.periods.js";

export function createItemSalesComparisonRequester({
  requestReport = requestConnectorReport,
  resolveCompany = resolveRequestCompany,
} = {}) {
  return async (clientId, input, shouldStop = () => false) => {
    const targets = [];
    // Authorize both IDs against the authenticated client before any report work.
    for (const id of input.company_ids)
      targets.push(
        await resolveCompany(clientId, { company_id: id.trim() }, { requireLive: false }),
      );
    const reports = [],
      requestIds = [];
    const periods = comparisonPeriods(input);
    for (const target of targets) {
      if (shouldStop()) return { disconnected: true };
      const lookup = {
        company_id: target.company_id,
        ...periods.find((period) => period.company_id === target.company_id),
        match_by: comparisonMatchBy(input),
        sales_basis: input.sales_basis || "gross",
        comparison_type: input.comparison_type || "year-wise",
        ...(input.item_code !== undefined ? { item_code: input.item_code.trim() } : {}),
        ...(input.stock_item !== undefined ? { stock_item: input.stock_item.trim() } : {}),
      };
      const result = await requestReport(clientId, lookup, "item_sales", shouldStop, {
        timeoutEnv: "ITEM_SALES_RESPONSE_TIMEOUT_MS",
        timeoutDefault: 120000,
      });
      if (
        result.disconnected ||
        result.timedOut ||
        !result.request ||
        result.request.status !== "succeeded"
      )
        return result;
      const report = result.request.tally_result?.item_sales;
      if (
        !report ||
        report.company_guid !== target.company_guid ||
        report.company_id !== target.company_id
      )
        throw comparisonError(
          "Connector returned item sales for an unexpected company. No comparison was generated.",
          502,
        );
      reports.push(report);
      requestIds.push(result.requestId);
    }
    const comparison = { ...buildItemSalesComparison(reports, input), request_ids: requestIds };
    return {
      request: { status: "succeeded", tally_result: { comparison } },
      requestId: requestIds.at(-1),
    };
  };
}
export const requestItemSalesComparison = createItemSalesComparisonRequester();
