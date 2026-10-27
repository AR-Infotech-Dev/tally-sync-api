import { failureResponse } from "../shared/utils/apiResponse.js";

export function errorHandler(error, req, res, next) {
  if (error.apiCode) return failureResponse(res, { code: error.apiCode, httpStatus: error.status || 500, message: error.message, data: error.data });
  const status = error.status || 500;
  const payload = {
    flag: "F",
    statusCode: status,
    msg: error.message || "Internal server error",
    data: error.data || []
  };

  if (process.env.NODE_ENV !== "production") {
    payload.stack = error.stack;
  }
  res.status(status).json(payload);
}
