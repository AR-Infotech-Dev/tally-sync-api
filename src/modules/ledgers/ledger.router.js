import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { getLedgerStatement, getLedgerStatementPdf, getLedgerStatementStatus } from "./ledger.controller.js";

const router = express.Router();
router.post("/statement", requireClientApiKey, getLedgerStatement);
router.post("/statement/pdf", requireClientApiKey, getLedgerStatementPdf);
router.get("/:requestId/status", requireClientApiKey, getLedgerStatementStatus);
export default router;
