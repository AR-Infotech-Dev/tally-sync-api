import { failureResponse } from "../../shared/utils/apiResponse.js";
import { CONSOLE_COOKIE_NAME, verifyConsoleSession } from "./console.auth.js";

export function requireConsoleSession(req, res, next) {
  res.set("Cache-Control", "no-store");
  const session = verifyConsoleSession(req.cookies?.[CONSOLE_COOKIE_NAME]);
  if (!session) {
    return failureResponse(res, {
      code: 2401,
      httpStatus: 401,
      message: "Admin Console login required.",
    });
  }
  req.consoleUser = session.username;
  return next();
}
