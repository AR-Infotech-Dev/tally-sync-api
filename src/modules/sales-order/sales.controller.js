import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { queueSalesOrder, readSalesOrder } from "./sales.service.js";
import { validateSalesOrderRequest } from "./sales.validator.js";

export const pushSalesOrder = asyncHandler(async (req, res) => {
  const errors = validateSalesOrderRequest(req.body);
  if (errors.length) {
    return failureResponse(res, {
      code: 2001,
      httpStatus: 400,
      message: "Invalid sales order request.",
      data: { errors },
    });
  }

  const result = await queueSalesOrder({ ...req.body, client_id: req.client.client_id });
  return successResponse(res, {
    code: 1001,
    httpStatus: 202,
    message: result.duplicate ? "Sales order request already exists." : "Sales order accepted for processing.",
    data: {
      request_id: result.request.request_id,
      status: result.request.status,
      duplicate: result.duplicate,
      connector_notified: result.connectorNotified,
    },
  });
});

export const getSalesOrderRequest = asyncHandler(async (req, res) => {
  const request = await readSalesOrder(req.client.client_id, req.params.requestId);
  if (!request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Sales order request not found." });
  return successResponse(res, { code: 1000, httpStatus: 200, message: "Sales order request retrieved.", data: request });
});
