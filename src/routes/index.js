import express from "express";
import ledgerRouter from "../modules/ledgers/ledger.router.js";
import salesOrderRouter from "../modules/sales-order/sales.router.js";
import salesRouter from "../modules/sales/sales.router.js";
import receiptRouter from "../modules/receipts/receipt.router.js";
import clientRouter from "../modules/clients/client.router.js";
import purchaseOrderRouter from "../modules/purchases/purchase-order.router.js";
import purchaseRouter from "../modules/purchases/purchase.router.js";
import paymentRouter from "../modules/purchases/payment.router.js";
import groupSummaryRouter from "../modules/group-summary/group-summary.router.js";
import companyRouter from "../modules/companies/company.router.js";
import outstandingRouter from "../modules/outstanding/outstanding.router.js";

const router = express.Router();
router.use("/ledgers", ledgerRouter);
router.use("/group-summary", groupSummaryRouter);
router.use("/companies", companyRouter);
router.use("/outstanding", outstandingRouter);
router.use("/sales-orders", salesOrderRouter);
router.use("/sales", salesRouter);
router.use("/receipts", receiptRouter);
router.use("/purchase-orders", purchaseOrderRouter);
router.use("/purchases", purchaseRouter);
router.use("/payments", paymentRouter);
router.use("/clients", clientRouter);

export default router;
