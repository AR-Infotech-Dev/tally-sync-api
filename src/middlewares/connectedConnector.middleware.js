import { assertConnectorResponsive } from "../modules/connectors/connectorAvailability.service.js";
import { failureResponse } from "../shared/utils/apiResponse.js";
import { asyncHandler } from "../shared/utils/asyncHandler.js";

/** Run after client authentication; never trust an unverified header or body ID. */
export const requireConnectedConnector = asyncHandler(async (req, res, next) => {
  const clientId = req.client?.client_id;
  if (!clientId) {
    return failureResponse(res, { code: 2005, httpStatus: 401, message: "Client authentication is required." });
  }
  await assertConnectorResponsive(clientId);
  return next();
});
