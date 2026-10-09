import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { registerClient } from "./client.service.js";
import { validateClientRegistration } from "./client.validator.js";

export const registerClientController = asyncHandler(async (req, res) => {
  const errors = validateClientRegistration(req.body);
  if (errors.length) {
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "Invalid client registration request.",
      data: { errors },
    });
  }

  const client = await registerClient(req.body);
  return successResponse(res, {
    code: 1001,
    httpStatus: 201,
    message: "Client registered. Credentials were sent to the registered email address.",
    data: {
      client_id: client.clientId,
      connector_id: client.connectorId,
      email: client.email,
      credentials_emailed: true,
    },
  });
});
