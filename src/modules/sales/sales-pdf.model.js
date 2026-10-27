import { getMongoCollection } from "../../config/mongo.database.js";

const COLLECTION = "sales_voucher_pdfs";
const configuredRetentionDays = Number.parseInt(process.env.SALES_PDF_RETENTION_DAYS || "90", 10);
const RETENTION_DAYS = Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0 ? configuredRetentionDays : 90;
let indexesReady;

async function getCollection() {
  const collection = await getMongoCollection(COLLECTION);
  if (!indexesReady) {
    indexesReady = Promise.all([
      collection.createIndex({ client_id: 1, request_id: 1 }, { unique: true, name: "uniq_client_sales_pdf" }),
      collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "ttl_sales_pdfs" }),
    ]).catch((error) => {
      indexesReady = undefined;
      throw error;
    });
  }
  await indexesReady;
  return collection;
}

export async function getSalesPdf(clientId, requestId) {
  const collection = await getCollection();
  return collection.findOne({ client_id: clientId, request_id: requestId, $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: new Date() } }] });
}

export async function findPendingSalesPdfs(clientId) {
  const collection = await getCollection();
  return collection.find({ client_id: clientId, status: "queued" })
    .project({ request_id: 1 })
    .toArray();
}

export async function queueSalesPdf(clientId, requestId, lookup) {
  const collection = await getCollection();
  const now = new Date();
  const current = await collection.findOne({ client_id: clientId, request_id: requestId });
  if ((!current?.expires_at || new Date(current.expires_at) > now) && ["ready", "queued", "generating"].includes(current?.status)) return current;

  await collection.updateOne(
    { client_id: clientId, request_id: requestId },
    {
      $set: { status: "queued", updated_at: now, error: null, ...(lookup ? { lookup, expires_at: new Date(now.getTime() + RETENTION_DAYS * 86400000) } : {}) },
      $setOnInsert: { client_id: clientId, request_id: requestId, created_at: now },
      $unset: { pdf: "", error_code: "", ...(!lookup ? { expires_at: "" } : {}) },
    },
    { upsert: true },
  );
  return collection.findOne({ client_id: clientId, request_id: requestId });
}

export async function markSalesPdfGenerating(clientId, requestId) {
  const collection = await getCollection();
  await collection.updateOne(
    { client_id: clientId, request_id: requestId, status: "queued" },
    { $set: { status: "generating", updated_at: new Date() } },
  );
}

export async function readSalesPdf(clientId, requestId) {
  const collection = await getCollection();
  return collection.findOne({ client_id: clientId, request_id: requestId });
}

export async function completeSalesPdf(clientId, requestId, pdf, filename = "sales-voucher.pdf", requestExpiresAt) {
  const collection = await getCollection();
  const now = new Date();
  const pdfExpiry = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const requestExpiry = requestExpiresAt ? new Date(requestExpiresAt) : null;
  const expiresAt = requestExpiry && requestExpiry < pdfExpiry ? requestExpiry : pdfExpiry;
  await collection.updateOne(
    { client_id: clientId, request_id: requestId },
    {
      $set: {
        status: "ready",
        pdf,
        filename: filename.replace(/[\\/\r\n\0]/g, "_").slice(0, 160),
        mime_type: "application/pdf",
        updated_at: now,
        expires_at: expiresAt,
      },
      $unset: { error: "", error_code: "" },
    },
  );
}

export async function failSalesPdf(clientId, requestId, error, errorCode) {
  const collection = await getCollection();
  const now = new Date();
  await collection.updateOne(
    { client_id: clientId, request_id: requestId },
    { $set: { status: "failed", error: String(error || "PDF export failed").slice(0, 2000), ...(errorCode ? { error_code: errorCode } : {}), updated_at: now, expires_at: new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
  );
}
