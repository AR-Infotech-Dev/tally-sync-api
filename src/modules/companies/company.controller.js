import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { listCompanies } from "./company.service.js";

export const getCompanies = asyncHandler(async (req, res) => {
  try {
    const companies = await listCompanies(req.client.client_id);
    return successResponse(res, { message: "Companies retrieved from the Connector cache.", data: { companies } });
  } catch (error) {
    const code = error.code === "CONNECTOR_NOT_CONNECTED"
      ? 2013
      : error.code === "CONNECTOR_CHECK_TIMEOUT"
        ? 2015
        : 2000;
    const status = error.code === "CONNECTOR_NOT_CONNECTED"
      ? 503
      : error.code === "CONNECTOR_CHECK_TIMEOUT"
        ? 504
        : 503;
    return failureResponse(res, { code, httpStatus: status, message: error.message });
  }
});
