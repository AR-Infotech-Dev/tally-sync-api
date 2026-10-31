import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { requestOutstanding, readOutstanding } from "./outstanding.service.js";
import { generateOutstandingPdf } from "./outstanding-pdf.service.js";
const router = express.Router();

const handler = (pdf = false) => asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.company_id || (!body.ledger_name && !body.dealer_code)) return failureResponse(res, { code: 2001, httpStatus: 400, message: "company_id and ledger_name or dealer_code are required." });
  const result = await requestOutstanding(req.client.client_id, body, () => res.destroyed);
  if (result.timedOut) return failureResponse(res, { code: 2011, httpStatus: 504, message: "Connector did not return Outstanding report before timeout.", data: { request_id: result.requestId } });
  if (!result.request || result.request.status === "failed") return failureResponse(res, { code: 2012, httpStatus: result.request?.tally_result?.lookup_status || 502, message: result.request?.error || "Outstanding lookup failed." });
  const data = result.request.tally_result?.outstanding;
  console.log('data : ',data);
  if (pdf) {
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=outstanding.pdf" });
    return res.status(200).send(await generateOutstandingPdf({ ...data, pdf_options: body, company_address: data.company_details?.address?.join(", "), company_email: data.company_details?.email, company_phone: data.company_details?.phone }));
  }
  return successResponse(res, { message: "Outstanding report retrieved from local synced database.", data: { data } });
});

router.post("/", requireClientApiKey, requireConnectedConnector, handler());
router.post("/pdf", requireClientApiKey, requireConnectedConnector, handler(true));
router.get("/:requestId/status", requireClientApiKey, asyncHandler(async (req, res) => { const request = await readOutstanding(req.client.client_id, req.params.requestId); if (!request) return failureResponse(res, { code: 2004, httpStatus: 404, message: "Outstanding job not found." }); return successResponse(res, { data: { request_id: request.request_id, status: request.status } }); }));
export default router;
