import { createHash, timingSafeEqual } from "node:crypto";
import { asyncHandler } from "../shared/utils/asyncHandler.js";
import { failureResponse } from "../shared/utils/apiResponse.js";
import { findActiveClient } from "../modules/clients/client.model.js";

export const requireClientApiKey = asyncHandler(async (req, res, next) => {
  const clientId = req.get("x-client-id");
  const apiKey = req.get("x-api-key");

  if (!clientId || !apiKey) {
    return failureResponse(res, {
      code: 2005,
      httpStatus: 401,
      message: "X-Client-ID and X-API-Key headers are required.",
    });
  }

  const client = await findActiveClient(clientId);
  const storedHash = client?.api_key_hash;
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) {
    return failureResponse(res, { code: 2005, httpStatus: 401, message: "Invalid client credentials." });
  }

  const receivedHash = createHash("sha256").update(apiKey).digest();
  const expectedHash = Buffer.from(storedHash, "hex");
  if (!timingSafeEqual(receivedHash, expectedHash)) {
    return failureResponse(res, { code: 2005, httpStatus: 401, message: "Invalid client credentials." });
  }

  req.client = { client_id: client.client_id };
  return next();
});
