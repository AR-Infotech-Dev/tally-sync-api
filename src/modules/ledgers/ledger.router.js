import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { getLedgerStatement, getLedgerStatementPdf, getLedgerStatementStatus } from "./ledger.controller.js";

const router = express.Router();
router.post("/statement", requireClientApiKey, requireConnectedConnector, getLedgerStatement);
router.post("/statement/pdf", requireClientApiKey, requireConnectedConnector, getLedgerStatementPdf);
router.get("/:requestId/status", requireClientApiKey, getLedgerStatementStatus);
export default router;
