import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { getGroupSummary, getGroupSummaryPdf, getGroupSummaryStatus } from "./group-summary.controller.js";

const router = express.Router();
router.post("/", requireClientApiKey, requireConnectedConnector, getGroupSummary);
router.post("/pdf", requireClientApiKey, requireConnectedConnector, getGroupSummaryPdf);
router.get("/:requestId/status", requireClientApiKey, getGroupSummaryStatus);
export default router;
