import { getReleaseConfig } from "./connector-release.config.js";
import { releaseError, releaseTokensMatch } from "./connector-release.utils.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";

export const requireReleaseToken = asyncHandler(async (req, _res, next) => {
  const config = getReleaseConfig();
  if (config.token.length < 32) throw releaseError(503, "Connector publishing is not configured on this server.");
  if (!releaseTokensMatch(req.get("x-release-token"), config.token)) throw releaseError(401, "Invalid release publishing credentials.");
  req.releaseConfig = config;
  next();
});
