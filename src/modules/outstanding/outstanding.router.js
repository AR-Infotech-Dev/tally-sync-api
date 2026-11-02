import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import { getOutstanding, getOutstandingPdf, getOutstandingStatus } from "./outstanding.controller.js";
const router = express.Router();
router.post("/", requireClientApiKey, requireConnectedConnector, getOutstanding);
router.post("/pdf", requireClientApiKey, requireConnectedConnector, getOutstandingPdf);
router.get("/:requestId/status", requireClientApiKey, getOutstandingStatus);
export default router;
