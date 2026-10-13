import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getSalesVoucherRequest, pushSalesVoucher, requestSalesVoucherPdfDownload, updateSalesVoucherPdfStatus, uploadSalesVoucherPdf } from "./sales.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, pushSalesVoucher);
router.get("/:requestId/pdf", requireClientApiKey, requestSalesVoucherPdfDownload);
router.post("/:requestId/pdf/connector", requireConnectorKey, express.raw({ type: "application/pdf", limit: "15mb" }), uploadSalesVoucherPdf);
router.post("/:requestId/pdf/connector/status", requireConnectorKey, updateSalesVoucherPdfStatus);
router.get("/:requestId", requireClientApiKey, getSalesVoucherRequest);
router.get("/:requestId/connector", requireConnectorKey, getSalesVoucherRequest);

export default router;
