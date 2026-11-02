import { asyncHandler } from "../utils/asyncHandler.js";
import { failureResponse, successResponse } from "../utils/apiResponse.js";

export function createReportHandlers(config) {
  const {
    label,
    validate,
    request,
    read,
    resultKey,
    generatePdf,
    filename,
    messages = {},
  } = config;
  const handler = (pdf = false) =>
    asyncHandler(async (req, res) => {
      const errors = validate(req.body);
      if (errors.length)
        return failureResponse(res, {
          code: 2001,
          httpStatus: 400,
          message: messages.validation || `Invalid ${label} request.`,
          data: { errors },
        });
      const result = await request(req.client.client_id, req.body, () => res.destroyed);
      if (result.disconnected || res.destroyed) return;
      if (!result.request)
        return failureResponse(res, {
          code: config.missingJobCode || 2004,
          httpStatus: config.missingJobStatus || 404,
          message: messages.notFound || `${label} job not found.`,
        });
      if (result.timedOut)
        return failureResponse(res, {
          code: 2011,
          httpStatus: 504,
          message: messages.timeout || `Connector did not return the ${label} before timeout.`,
          data: { request_id: result.requestId },
        });
      if (result.request.status === "failed")
        return failureResponse(res, {
          code: 2012,
          httpStatus: result.request.tally_result?.lookup_status || 502,
          message: result.request.error || messages.failure || `${label} lookup failed.`,
        });
      const data = result.request.tally_result?.[resultKey];
      if (!data)
        return failureResponse(res, {
          code: 2012,
          httpStatus: 502,
          message: messages.missingResult || `Connector returned no ${label}.`,
        });
      if (pdf || (config.allowFormatQuery && req.query.format === "pdf")) {
        const buffer = await generatePdf(data, req.body);
        if (res.destroyed) return;
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename(data)}"`,
          "Cache-Control": "no-store",
        });
        return res.status(200).send(buffer);
      }
      return successResponse(res, { message: messages.success, data: { data } });
    });
  const status =
    read &&
    asyncHandler(async (req, res) => {
      const job = await read(req.client.client_id, req.params.requestId);
      if (!job)
        return failureResponse(res, {
          code: 2004,
          httpStatus: 404,
          message: messages.statusNotFound || messages.notFound || `${label} job not found.`,
        });
      return successResponse(res, {
        data: {
          request_id: job.request_id,
          status: job.status,
          ...(config.statusDetails !== false && job.error ? { error: job.error } : {}),
          ...(config.statusDetails !== false && job.tally_result?.[resultKey]
            ? { [resultKey]: job.tally_result[resultKey] }
            : {}),
        },
      });
    });
  return { json: handler(), pdf: handler(true), status };
}
