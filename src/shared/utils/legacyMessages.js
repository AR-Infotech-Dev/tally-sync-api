// ===============================
// HTTP STATUS CODES
// ===============================
export const httpStatusCodes = {
  200: "OK",
  202: "ACCEPTED",
  201: "CREATED",
  204: "NO_CONTENT",
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",  
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  424: "FAILED_DEPENDENCY",
  500: "INTERNAL_SERVER_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT"
};

// ===============================
// SUCCESS CUSTOM CODES (1000-1999)
// ===============================
export const successMessages = {
  1000: "Success",
  1001: "Created successfully",
  1002: "Updated successfully",
  1003: "Deleted successfully",
  1004: "Fetched successfully",
  1005: "Login successful",
  1006: "Logout successful",
  1007: "DB connection Successfull"
};

// ===============================
// FAILURE CUSTOM CODES (2000-2999)
// ===============================
export const failureMessages = {
  2000: "Failed",
  2001: "Validation failed",
  2002: "Email already exists",
  2003: "Username already exists",
  2004: "Record not found",
  2005: "Unauthorized access",
  2006: "Token expired",
  2007: "Permission denied",
  2008: "Something went wrong",
  2009: "Session expired",
  2013: "Connector is not connected.",
  2014: "Tally is not connected.",
  2015: "Connection check timed out.",
};

// ===============================
// FUNCTIONS
// ===============================
export const getHttpStatusMessage = (code) => {
  return httpStatusCodes[code] || "Unknown Status";
};

export const getSuccessMessage = (code) => {
  return successMessages[code] || "Success";
};

export const getFailureMessage = (code) => {
  return failureMessages[code] || "Failed";
};
