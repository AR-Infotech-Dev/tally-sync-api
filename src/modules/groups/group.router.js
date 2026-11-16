import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { requireConnectedConnector } from "../../middlewares/connectedConnector.middleware.js";
import { getGroups } from "./group.controller.js";

const router = express.Router();

router.post("/", requireClientApiKey, requireConnectedConnector, getGroups);
export default router;

