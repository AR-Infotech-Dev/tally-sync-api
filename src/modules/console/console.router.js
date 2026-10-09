import express from "express";
import { rateLimit } from "../../middlewares/rateLimit.middleware.js";
import { requireConsoleSession } from "./console.auth.middleware.js";
import { getConsoleAuthStatus, getConsoleDashboard, getConsoleSession, loginToConsole, logoutFromConsole } from "./console.controller.js";

const router = express.Router();

router.get("/auth/status", getConsoleAuthStatus);
router.post("/auth/login", rateLimit({ max: 5, windowMs: 15 * 60 * 1000, keyPrefix: "console-login", message: "Too many login attempts. Try again in 15 minutes." }), loginToConsole);
router.post("/auth/logout", logoutFromConsole);
router.get("/auth/me", requireConsoleSession, getConsoleSession);
router.get("/snapshot", requireConsoleSession, getConsoleDashboard);

export default router;
