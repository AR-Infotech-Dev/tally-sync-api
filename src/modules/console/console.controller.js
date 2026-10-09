import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import {
  CONSOLE_COOKIE_NAME,
  consoleSessionCookieOptions,
  createConsoleSession,
  isConsoleConfigured,
  verifyConsoleCredentials,
} from "./console.auth.js";
import { getConsoleSnapshot } from "./console.service.js";

export const getConsoleAuthStatus = (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.json({ configured: isConsoleConfigured() });
};

export const loginToConsole = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!isConsoleConfigured()) {
    return failureResponse(res, {
      code: 2403,
      httpStatus: 503,
      message: "Admin Console credentials are not configured on the Server.",
    });
  }

  if (!verifyConsoleCredentials(req.body?.username, req.body?.password)) {
    return failureResponse(res, { code: 2401, httpStatus: 401, message: "Username or password is incorrect." });
  }

  res.cookie(CONSOLE_COOKIE_NAME, createConsoleSession(process.env.CONSOLE_USERNAME), consoleSessionCookieOptions);
  return successResponse(res, {
    code: 1400,
    message: "Admin Console login successful.",
    data: { authenticated: true, username: process.env.CONSOLE_USERNAME },
  });
});

export const logoutFromConsole = (_req, res) => {
  res.set("Cache-Control", "no-store");
  const { httpOnly, sameSite, secure, path } = consoleSessionCookieOptions;
  res.clearCookie(CONSOLE_COOKIE_NAME, { httpOnly, sameSite, secure, path });
  return successResponse(res, { code: 1401, message: "Admin Console session ended.", data: { authenticated: false } });
};

export const getConsoleSession = (req, res) => successResponse(res, {
  code: 1400,
  message: "Admin Console session is active.",
  data: { authenticated: true, username: req.consoleUser },
});

export const getConsoleDashboard = asyncHandler(async (_req, res) => {
  const snapshot = await getConsoleSnapshot();
  return successResponse(res, { code: 1400, message: "Admin Console snapshot loaded.", data: snapshot });
});
