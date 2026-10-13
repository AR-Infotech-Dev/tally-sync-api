import { randomUUID } from "node:crypto";
import { getMongoCollection } from "../../config/mongo.database.js";

const COLLECTION = "sales_order_requests";
const configuredRetentionDays = Number.parseInt(process.env.REQUEST_RETENTION_DAYS || "90", 10);
const RETENTION_DAYS = Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0 ? configuredRetentionDays : 90;
let indexesReady;

async function getCollection() {
  const collection = await getMongoCollection(COLLECTION);
  if (!indexesReady) {
    indexesReady = Promise.all([
      collection.createIndex(
        { client_id: 1, idempotency_key: 1 },
        {
          unique: true,
          name: "uniq_client_idempotency_key",
          partialFilterExpression: { idempotency_key: { $type: "string" } },
        },
      ),
      // MongoDB's TTL monitor removes terminal jobs after their retention date.
      collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "ttl_terminal_requests" }),
    ]).catch((error) => {
      indexesReady = undefined;
      throw error;
    });
  }
  await indexesReady;
  return collection;
}

export async function createSalesOrderRequest(input) {
  const collection = await getCollection();
  const now = new Date();
  const request = {
    request_id: randomUUID(),
    client_id: input.client_id,
    destination: input.destination,
    transaction_type: input.transaction_type || "sales_order",
    ...(input.sales_order || input.sales ? { sales_order: input.sales_order || input.sales } : {}),
    ...(input.receipt ? { receipt: input.receipt } : {}),
    ...(input.purchase_order ? { purchase_order: input.purchase_order } : {}),
    ...(input.purchase ? { purchase: input.purchase } : {}),
    ...(input.payment ? { payment: input.payment } : {}),
    status: "queued",
    attempt_count: 0,
    created_at: now,
    updated_at: now,
  };
  if (input.idempotency_key) request.idempotency_key = input.idempotency_key;

  try {
    await collection.insertOne(request);
    return { request, duplicate: false };
  } catch (error) {
    if (error.code !== 11000 || !input.idempotency_key) throw error;
    const existing = await collection.findOne({ client_id: input.client_id, idempotency_key: input.idempotency_key });
    if (!existing) throw error;
    return { request: existing, duplicate: true };
  }
}

export async function findQueuedSalesOrders(clientId) {
  const collection = await getCollection();
  return collection.find({ client_id: clientId, status: "queued" })
    .sort({ created_at: 1 })
    .project({ request_id: 1, transaction_type: 1 })
    .toArray();
}

export async function markSalesOrderProcessing(clientId, requestId) {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { client_id: clientId, request_id: requestId, status: "queued" },
    { $set: { status: "processing", updated_at: new Date() }, $inc: { attempt_count: 1 } },
  );
  return result.modifiedCount === 1;
}

export async function getSalesOrderRequest(clientId, requestId) {
  const collection = await getCollection();
  return collection.findOne({ client_id: clientId, request_id: requestId });
}

export async function updateSalesOrderRequest(clientId, requestId, update) {
  const collection = await getCollection();
  const allowed = {
    status: update.status,
    updated_at: new Date(),
    ...(update.error ? { error: String(update.error).slice(0, 2000) } : {}),
    ...(update.tally_result ? { tally_result: update.tally_result } : {}),
    ...(update.status === "succeeded" || update.status === "failed"
      ? { expires_at: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000) }
      : {}),
  };
  const updateOperation = { $set: allowed };
  if (update.status && update.status !== "succeeded" && update.status !== "failed") {
    updateOperation.$unset = { expires_at: "" };
  }
  await collection.updateOne({ client_id: clientId, request_id: requestId }, updateOperation);
  return collection.findOne({ client_id: clientId, request_id: requestId });
}
