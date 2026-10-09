import express from "express";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";
import { registerClientController } from "./client.controller.js";

const router = express.Router();
router.post("/register", rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: "client-registration" }), registerClientController,);

export default router;
