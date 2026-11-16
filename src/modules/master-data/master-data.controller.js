import { createReportHandlers } from "../../shared/http/reportHandlers.js";
import { requestMasterData } from "./master-data.service.js";
import { validateMasterData } from "./master-data.validator.js";

function masterDataHandler(catalog, label) {
  return createReportHandlers({
    label,
    validate: (body) => validateMasterData(body, catalog),
    request: (clientId, input, shouldStop) =>
      requestMasterData(clientId, input, catalog, shouldStop),
    resultKey: "master_data",
  }).json;
}

export const getLedgerList = masterDataHandler("ledgers", "Ledgers");
export const getStockItems = masterDataHandler("stock_items", "Stock items");
export const getVoucherTypes = masterDataHandler("voucher_types", "Voucher types");
export const getGodowns = masterDataHandler("godowns", "Godowns");
export const getStockAvailability = masterDataHandler("stock_availability", "Stock availability");
