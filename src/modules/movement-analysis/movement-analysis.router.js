import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import { getStockItemMovementPdf } from "./movement-analysis.controller.js";
const router = express.Router();
router.post("/pdf", requireClientApiKey, requireConnectedConnector, getStockItemMovementPdf);
export default router;
