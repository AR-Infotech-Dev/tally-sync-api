import { listRegisteredConnectors, requestConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";
import {
  findPendingTallyNotifications,
  markTallyNotificationDelivered,
} from "./tally-notification.model.js";

export function createTallyNotificationDispatcher({
  connected = (clientId) => listRegisteredConnectors().some((row) => row.clientId === clientId),
  read = findPendingTallyNotifications,
  markDelivered = markTallyNotificationDelivered,
  request = requestConnector,
  log = recordConsoleLog,
} = {}) {
  const active = new Map();
  return function dispatch(clientId) {
    if (active.has(clientId)) return active.get(clientId);
    const task = Promise.resolve()
      .then(async () => {
        if (!connected(clientId)) return 0;
        let count = 0;
        for (const row of await read(clientId)) {
          if (row.client_id !== clientId) throw new Error("Notification client scope mismatch.");
          const payload = Object.fromEntries(
            [
              "notification_id",
              "client_id",
              "company_id",
              "company",
              "company_guid",
              "company_key",
              "entity",
              "action",
              "master_id",
              "voucher_guid",
              "previous_date",
            ]
              .filter((key) => row[key] !== undefined)
              .map((key) => [key, row[key]]),
          );
          try {
            const ack = await request(clientId, SOCKET_EVENTS.tallyNotification, payload, 5000);
            if (ack.notification_id !== row.notification_id || ack.status !== "queued")
              throw new Error("Connector did not confirm durable notification receipt.");
            await markDelivered(clientId, row.notification_id);
            count++;
            log("success", "Tally notification queued by Connector", {
              client_id: clientId,
              notification_id: row.notification_id,
              company_id: row.company_id,
              master_id: row.master_id,
              action: row.action,
            });
          } catch (error) {
            log("warn", "Tally notification delivery pending; will retry", {
              client_id: clientId,
              notification_id: row.notification_id,
              message: error.message,
            });
            break;
          }
        }
        return count;
      })
      .finally(() => active.delete(clientId));
    active.set(clientId, task);
    return task;
  };
}
export const dispatchPendingTallyNotifications = createTallyNotificationDispatcher();
