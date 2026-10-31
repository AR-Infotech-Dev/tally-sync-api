import express from "express";
import { requireClientApiKey } from "../../middlewares/clientApiKey.middleware.js";
import { getCompanies } from "./company.controller.js";

const router = express.Router();
router.get("/", requireClientApiKey, getCompanies);
export default router;
