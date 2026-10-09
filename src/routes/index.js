import express from "express";
import salesOrderRouter from "../modules/sales-order/sales.router.js";
import clientRouter from "../modules/clients/client.router.js";

const router = express.Router();
router.use("/sales-orders", salesOrderRouter);
router.use("/clients", clientRouter);

export default router;
