import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getPurchaseRequest, pushPurchase } from "./purchase.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, pushPurchase("payment_voucher"));
router.get("/:requestId", requireClientApiKey, getPurchaseRequest("payment_voucher"));
router.get("/:requestId/connector", requireConnectorKey, getPurchaseRequest("payment_voucher"));
export default router;
