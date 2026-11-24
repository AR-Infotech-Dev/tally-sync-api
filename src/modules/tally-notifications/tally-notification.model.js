import { getMongoCollection } from "../../config/mongo.database.js";

let indexes;
export async function saveTallyNotification(notification) {
  const rows = await getMongoCollection("tally_notifications");
  indexes ||= rows.createIndex({ client_id: 1, received_at: -1 }).catch((error) => {
    indexes = null;
    throw error;
  });
  await indexes;
  await rows.insertOne({ ...notification });
}

export async function findPendingTallyNotifications(clientId) {
  const rows = await getMongoCollection("tally_notifications");
  return rows
    .find({ client_id: clientId, status: "received" }, { projection: { _id: 0 } })
    .sort({ received_at: 1, _id: 1 })
    .limit(100)
    .toArray();
}

export async function markTallyNotificationDelivered(clientId, notificationId) {
  const rows = await getMongoCollection("tally_notifications");
  await rows.updateOne(
    { client_id: clientId, notification_id: notificationId, status: "received" },
    { $set: { status: "delivered", delivered_at: new Date().toISOString() } },
  );
}
