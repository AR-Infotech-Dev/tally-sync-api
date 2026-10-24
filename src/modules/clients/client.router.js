import express from "express";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";
import { registerClientController, activateConnectorController } from "./client.controller.js";

const router = express.Router();
router.post("/register", rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: "client-registration" }), registerClientController,);
router.post('/activate-connector', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'connector-activation' }), activateConnectorController);

export default router;
