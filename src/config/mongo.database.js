import "dotenv/config";
import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const mongoDbName = process.env.MONGODB_DB_NAME || "tally_sync";
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5_000 });
let connectionPromise;

export async function getMongoDb() {
  console.log("Connecting to MongoDB at:", mongoUri, "Database:", mongoDbName);
  if (!connectionPromise) {
    connectionPromise = client.connect().then(() => client.db(mongoDbName)).catch((cause) => {
      connectionPromise = undefined;
      const error = new Error("MongoDB is unavailable. Check MONGODB_URI and confirm MongoDB is running.");
      error.status = 503;
      error.cause = cause;
      throw error;
    });
  }
  return connectionPromise;
}

export async function getMongoCollection(collectionName) {
  const db = await getMongoDb();
  return db.collection(collectionName);
}
