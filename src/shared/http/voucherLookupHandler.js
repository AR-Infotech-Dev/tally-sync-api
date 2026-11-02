import { asyncHandler } from "../utils/asyncHandler.js";
import { failureResponse, successResponse } from "../utils/apiResponse.js";
import { validateVoucherLookup } from "../utils/voucherLookup.validator.js";
import {
  queueConnectorJob,
  waitForConnectorJobCompletion,
} from "../../modules/connector-jobs/connector-job.service.js";

export const createVoucherLookupHandler = (transactionType, label) =>
  asyncHandler(async (req, res) => {
    const { lookup, errors } = validateVoucherLookup(req.query);
    if (errors.length)
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "company, ledger_name and voucher_no are required; voucher_date is optional.",
        data: { errors },
      });
    const result = await queueConnectorJob({
      client_id: req.client.client_id,
      transaction_type: transactionType,
      destination: { company: lookup.company },
      lookup: {
        company: lookup.company,
        ledger_name: lookup.ledgerName,
        voucher_no: lookup.voucherNumber,
        ...(lookup.voucherDate ? { voucher_date: lookup.voucherDate } : {}),
      },
    });
    const completion = await waitForConnectorJobCompletion(
      req.client.client_id,
      result.request.request_id,
      { shouldStop: () => res.destroyed },
    );
    if (completion.disconnected) return;
    if (!completion.request)
      return failureResponse(res, {
        code: 2004,
        httpStatus: 404,
        message: `${label} lookup job not found.`,
      });
    if (completion.timedOut)
      return failureResponse(res, {
        code: 2011,
        httpStatus: 504,
        message: `Connector did not return the Tally ${label} before timeout.`,
        data: { request_id: result.request.request_id },
      });
    const tallyResult = completion.request.tally_result;
    if (completion.request.status === "failed")
      return failureResponse(res, {
        code: 2012,
        httpStatus: tallyResult?.lookup_status || 502,
        message: completion.request.error || `Tally ${label} lookup failed.`,
      });
    if (!tallyResult?.voucher)
      return failureResponse(res, {
        code: 2012,
        httpStatus: 502,
        message: `Tally returned no ${label} data.`,
      });
    return successResponse(res, {
      message: `${label} retrieved from Tally.`,
      data: { vouchers: [tallyResult.voucher] },
    });
  });
