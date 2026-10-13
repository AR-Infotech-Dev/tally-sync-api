import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getPurchaseRequest, pushPurchase } from "./purchase.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, pushPurchase("purchase_order"));
router.get("/:requestId", requireClientApiKey, getPurchaseRequest("purchase_order"));
router.get("/:requestId/connector", requireConnectorKey, getPurchaseRequest("purchase_order"));
export default router;
