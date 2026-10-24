import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { registerClient, activateConnector } from "./client.service.js";
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

export const createActivateConnectorController = (activate = activateConnector) => asyncHandler(async (req, res) => {
  const code = typeof req.body?.activation_code === 'string' ? req.body.activation_code.trim() : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return failureResponse(res, { code: 2001, httpStatus: 400, message: 'Paste the complete activation code from your registration email.' });
  res.set('Cache-Control', 'no-store');
  try {
    return successResponse(res, { message: 'Connector activated. Continue with Tally setup.', data: await activate(code) });
  } catch (error) {
    if (error.status === 401) return failureResponse(res, { code: 2005, httpStatus: 401, message: error.message });
    throw error;
  }
});
export const activateConnectorController = createActivateConnectorController();
