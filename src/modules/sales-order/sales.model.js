import { randomUUID } from "node:crypto";
import { getMongoCollection } from "../../config/mongo.database.js";

const COLLECTION = "sales_order_requests";
let indexesReady;

async function getCollection() {
  const collection = await getMongoCollection(COLLECTION);
  if (!indexesReady) {
    indexesReady = collection.createIndex(
      { client_id: 1, idempotency_key: 1 },
      {
        unique: true,
        name: "uniq_client_idempotency_key",
        partialFilterExpression: { idempotency_key: { $type: "string" } },
      },
    ).catch((error) => {
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
    sales_order: input.sales_order,
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
    .project({ request_id: 1 })
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
  };
  await collection.updateOne({ client_id: clientId, request_id: requestId }, { $set: allowed });
  return collection.findOne({ client_id: clientId, request_id: requestId });
}
