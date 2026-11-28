import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import express from "express";
import { getMfgPdfConnectorJob } from "./mfg-journal.controller.js";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import {
  getMfgJournalRequest,
  pushMfgJournal,
  requestMfgJournalPdfDownload,
  requestMfgJournalPdfDownloadByNumber,
  updateMfgJournalPdfStatus,
  uploadMfgJournalPdf,
} from "./mfg-journal.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, requireConnectedConnector, pushMfgJournal);
router.get("/pdf", requireClientApiKey, requestMfgJournalPdfDownloadByNumber);
router.get("/:requestId/pdf", requireClientApiKey, requestMfgJournalPdfDownload);
router.get("/:requestId/pdf/connector", requireConnectorKey, getMfgPdfConnectorJob);
router.post(
  "/:requestId/pdf/connector",
  requireConnectorKey,
  express.raw({ type: "application/pdf", limit: "15mb" }),
  uploadMfgJournalPdf,
);
router.post("/:requestId/pdf/connector/status", requireConnectorKey, updateMfgJournalPdfStatus);
router.get("/:requestId", requireClientApiKey, getMfgJournalRequest);
router.get("/:requestId/connector", requireConnectorKey, getMfgJournalRequest);

export default router;
