import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { postTallyNotification } from "./tally-notification.controller.js";

const router = express.Router();
router.post(
  "/",
  requireClientApiKey,
  express.raw({ type: ["text/xml", "application/xml"], limit: "16kb" }),
  postTallyNotification,
);
export default router;
