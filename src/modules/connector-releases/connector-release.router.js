import express from "express";
import { requireReleaseToken } from "./connector-release.auth.middleware.js";
import { downloadConnectorRelease, publishConnectorRelease, readLatestConnectorRelease } from "./connector-release.controller.js";

const router = express.Router();
router.post("/", requireReleaseToken, publishConnectorRelease);
router.get("/latest", readLatestConnectorRelease);
router.get("/:version/:architecture/download", downloadConnectorRelease);

export default router;
