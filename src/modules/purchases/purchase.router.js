import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getPurchaseRequest, pushPurchase } from "./purchase.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, requireConnectedConnector, pushPurchase("purchase_voucher"));
router.get("/:requestId", requireClientApiKey, getPurchaseRequest("purchase_voucher"));
router.get("/:requestId/connector", requireConnectorKey, getPurchaseRequest("purchase_voucher"));
export default router;
