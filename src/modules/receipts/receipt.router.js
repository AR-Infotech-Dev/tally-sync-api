import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getReceiptVoucherRequest, pushReceiptVoucher } from "./receipt.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, pushReceiptVoucher);
router.get("/:requestId", requireClientApiKey, getReceiptVoucherRequest);
router.get("/:requestId/connector", requireConnectorKey, getReceiptVoucherRequest);

export default router;
