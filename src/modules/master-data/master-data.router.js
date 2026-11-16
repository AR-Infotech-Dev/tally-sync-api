import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import {
  getGodowns,
  getLedgerList,
  getStockAvailability,
  getStockItems,
  getVoucherTypes,
} from "./master-data.controller.js";

const router = express.Router();
router.post("/ledgers", requireClientApiKey, requireConnectedConnector, getLedgerList);
router.post("/stock-items", requireClientApiKey, requireConnectedConnector, getStockItems);
router.post("/voucher-types", requireClientApiKey, requireConnectedConnector, getVoucherTypes);
router.post("/godowns", requireClientApiKey, requireConnectedConnector, getGodowns);
router.post(
  "/stock-availability",
  requireClientApiKey,
  requireConnectedConnector,
  getStockAvailability,
);
export default router;
