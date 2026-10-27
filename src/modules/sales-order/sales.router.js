import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectorKey } from "../../middlewares/connectorApiKey.middleware.js";
import { getSalesOrderRequest, pushSalesOrder, getSalesOrderFromTally } from "./sales.controller.js";

const router = express.Router();
router.post("/push", requireClientApiKey, requireConnectedConnector, pushSalesOrder);
router.get("/", requireClientApiKey, requireConnectedConnector, getSalesOrderFromTally);
router.get("/:requestId/status", requireClientApiKey, getSalesOrderRequest);
router.get("/:requestId/connector", requireConnectorKey, getSalesOrderRequest);

export default router;
