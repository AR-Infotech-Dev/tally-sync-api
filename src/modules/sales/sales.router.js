import express from "express";
import { getSalesVoucherFromTally } from "../sales-order/sales.controller.js";
import { getSalesPdfConnectorJob } from "./sales.controller.js";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getSalesVoucherRequest, pushSalesVoucher, requestSalesVoucherPdfDownload, requestSalesVoucherPdfDownloadByNumber, updateSalesVoucherPdfStatus, uploadSalesVoucherPdf } from "./sales.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, pushSalesVoucher);
router.get("/", requireClientApiKey, getSalesVoucherFromTally);
router.get("/pdf", requireClientApiKey, requestSalesVoucherPdfDownloadByNumber);
router.get("/:requestId/pdf", requireClientApiKey, requestSalesVoucherPdfDownload);
router.get("/:requestId/pdf/connector", requireConnectorKey, getSalesPdfConnectorJob);
router.post("/:requestId/pdf/connector", requireConnectorKey, express.raw({ type: "application/pdf", limit: "15mb" }), uploadSalesVoucherPdf);
router.post("/:requestId/pdf/connector/status", requireConnectorKey, updateSalesVoucherPdfStatus);
router.get("/:requestId", requireClientApiKey, getSalesVoucherRequest);
router.get("/:requestId/connector", requireConnectorKey, getSalesVoucherRequest);

export default router;
