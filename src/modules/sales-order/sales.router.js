import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getSalesOrderRequest, pushSalesOrder, getSalesOrderFromTally } from "./sales.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, pushSalesOrder);
router.get("/", requireClientApiKey, getSalesOrderFromTally);
router.get("/:requestId/status", requireClientApiKey, getSalesOrderRequest);
router.get("/:requestId/connector", requireConnectorKey, getSalesOrderRequest);

export default router;
