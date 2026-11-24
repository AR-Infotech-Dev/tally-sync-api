import { randomUUID } from "node:crypto";
import { readClientCompanies } from "../companies/company.model.js";
import { companyError } from "../companies/company.identity.js";
import { recordConsoleLog } from "../console/consoleLog.store.js";
import { saveTallyNotification } from "./tally-notification.model.js";
import { dispatchPendingTallyNotifications } from "./tally-notification.dispatch.js";

export function createTallyNotificationReceiver({
  read = readClientCompanies,
  save = saveTallyNotification,
  log = recordConsoleLog,
  dispatch = dispatchPendingTallyNotifications,
} = {}) {
  return async (clientId, notification) => {
    // Use only this client's registered companies; receiving must not require a live Connector.
    const companies = (await read(clientId)).filter(
      (row) =>
        row.tally_guid?.toLowerCase() === notification.company_guid &&
        row.company_name?.trim() === notification.company,
    );
    if (!companies.length)
      throw companyError(
        "COMPANY_NOT_FOUND",
        "Register this Tally company with the client before sending notifications.",
        404,
      );
    if (companies.length !== 1)
      throw companyError(
        "COMPANY_AMBIGUOUS",
        "Multiple registered companies match this Tally GUID and name.",
      );
    const record = {
      notification_id: randomUUID(),
      client_id: clientId,
      company_id: companies[0].company_id,
      ...notification,
      ...(companies[0].company_key ? { company_key: companies[0].company_key } : {}),
      status: "received",
      received_at: new Date().toISOString(),
    };
    await save(record);
    log("info", "Tally notification received", {
      client_id: clientId,
      company_id: record.company_id,
      notification_id: record.notification_id,
      entity: record.entity,
      action: record.action,
      master_id: record.master_id,
    });
    // Acknowledge Tally after durable storage; delivery retries on register/heartbeat.
    Promise.resolve()
      .then(() => dispatch(clientId))
      .catch((error) =>
        log("warn", "Tally notification dispatch pending", {
          client_id: clientId,
          message: error.message,
        }),
      );
    return {
      notification_id: record.notification_id,
      company_id: record.company_id,
      status: record.status,
      received_at: record.received_at,
    };
  };
}
export const receiveTallyNotification = createTallyNotificationReceiver();
