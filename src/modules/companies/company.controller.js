import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { listCompanies } from "./company.service.js";

export const getCompanies = asyncHandler(async (req, res) => {
  try {
    const companies = await listCompanies(req.client.client_id);
    return successResponse(res, {
      message: "Client companies retrieved.",
      data: {
        companies: companies.map(
          ({ company_id, company_name, status, last_synced_at, sync_status }) => ({
            company_id,
            company_name,
            status,
            last_synced_at: last_synced_at || null,
            sync_status,
          }),
        ),
      },
    });
  } catch (error) {
    const code =
      error.code === "CONNECTOR_NOT_CONNECTED"
        ? 2013
        : error.code === "CONNECTOR_CHECK_TIMEOUT"
          ? 2015
          : 2000;
    const status =
      error.code === "CONNECTOR_NOT_CONNECTED"
        ? 503
        : error.code === "CONNECTOR_CHECK_TIMEOUT"
          ? 504
          : 503;
    return failureResponse(res, {
      code: error.apiCode || code,
      httpStatus: error.httpStatus || status,
      message: error.message,
      data: error.data,
    });
  }
});
