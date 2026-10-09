import { getMongoCollection } from "../../config/mongo.database.js";

const COLLECTION = "clients";
let clientIdIndexReady;
let licenseIndexReady;

async function getClientCollection() {
  const collection = await getMongoCollection(COLLECTION);
  if (!clientIdIndexReady) {
    clientIdIndexReady = collection.createIndex({ client_id: 1 }, { unique: true, name: "uniq_client_id" })
      .catch((error) => {
        clientIdIndexReady = undefined;
        throw error;
      });
  }
  if (!licenseIndexReady) {
    licenseIndexReady = collection.createIndex(
      { tally_license_no: 1 },
      {
        unique: true,
        name: "uniq_tally_license_no",
        partialFilterExpression: { tally_license_no: { $type: "string" } },
      },
    ).catch((error) => {
      licenseIndexReady = undefined;
      throw error;
    });
  }
  await Promise.all([clientIdIndexReady, licenseIndexReady]);
  return collection;
}

export async function findActiveClient(clientId) {
  const collection = await getClientCollection();
  return collection.findOne({ client_id: clientId, status: "active" });
}

export async function createClient(client) {
  const collection = await getClientCollection();
  await collection.insertOne(client);
}

export async function activateClient(clientId) {
  const collection = await getClientCollection();
  const result = await collection.updateOne(
    { client_id: clientId, status: "pending_email" },
    { $set: { status: "active", updated_at: new Date() } },
  );
  return result.modifiedCount === 1;
}

export async function deleteClient(clientId) {
  const collection = await getClientCollection();
  await collection.deleteOne({ client_id: clientId, status: "pending_email" });
}
