import { getMongoDb } from "../../config/mongo.database.js";
import { listRegisteredConnectors } from "../../socket/index.js";
import { listConsoleLogs } from "./consoleLog.store.js";
import { getConsoleDatabaseMetrics, listRecentConsoleSalesOrders } from "./console.model.js";

const startedAt = new Date();

export async function getConsoleSnapshot() {
  const connectors = listRegisteredConnectors();
  let database = { status: "unavailable", clients: null, salesOrders: null };
  let jobs = [];

  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    database = { status: "connected", ...(await getConsoleDatabaseMetrics()) };
    jobs = await listRecentConsoleSalesOrders(30);
  } catch {
    database = { status: "unavailable", clients: null, salesOrders: null };
  }

  return {
    capturedAt: new Date().toISOString(),
    server: {
      status: "online",
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: startedAt.toISOString(),
    },
    socket: { status: "online", registeredCount: connectors.length, connectors },
    database,
    jobs,
    logs: listConsoleLogs(120),
  };
}
