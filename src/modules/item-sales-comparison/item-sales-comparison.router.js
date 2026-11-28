import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import {
  getItemSalesComparison,
  getItemSalesComparisonPdf,
} from "./item-sales-comparison.controller.js";

const router = express.Router();
router.post("/", requireClientApiKey, requireConnectedConnector, getItemSalesComparison);
router.post("/pdf", requireClientApiKey, requireConnectedConnector, getItemSalesComparisonPdf);
export default router;
