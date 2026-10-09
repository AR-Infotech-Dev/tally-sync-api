import { getMongoCollection } from "../../config/mongo.database.js";

const SALES_ORDER_STATUSES = ["queued", "processing", "fetching", "building_xml", "pushing", "succeeded", "failed"];

export async function getConsoleDatabaseMetrics() {
  const clients = await getMongoCollection("clients");
  const salesOrders = await getMongoCollection("sales_order_requests");
  const [clientCount, activeClientCount, statusRows] = await Promise.all([
    clients.countDocuments({}),
    clients.countDocuments({ status: "active" }),
    salesOrders.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
  ]);

  const byStatus = Object.fromEntries(SALES_ORDER_STATUSES.map((status) => [status, 0]));
  for (const row of statusRows) if (Object.hasOwn(byStatus, row._id)) byStatus[row._id] = row.count;
  const totalSalesOrders = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return {
    clients: { total: clientCount, active: activeClientCount },
    salesOrders: { total: totalSalesOrders, byStatus },
  };
}

export async function listRecentConsoleSalesOrders(limit = 30) {
  const collection = await getMongoCollection("sales_order_requests");
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  return collection.find({}, {
    projection: {
      _id: 0,
      request_id: 1,
      client_id: 1,
      status: 1,
      attempt_count: 1,
      created_at: 1,
      updated_at: 1,
      error: 1,
      "destination.company": 1,
      "destination.company_name": 1,
      "sales_order.voucher_number": 1,
    },
  }).sort({ created_at: -1 }).limit(safeLimit).toArray();
}
