# Tally notification receiver

`POST /api/v1/tally/notifications`

Use the deployed Server HTTPS base URL. The endpoint stores notifications and signals the authenticated Connector using `tally:notification`. Connector persists the event in its existing local notification queue, then fetches the identified voucher and updates its cache.

Required headers use the existing client credentials:

```text
X-Client-ID: <client ID>
X-API-Key: <client API key>
Content-Type: application/json
```

```json
{
  "company": "Demo & Co",
  "company_guid": "11111111-2222-3333-4444-555555555555",
  "entity": "voucher",
  "action": "update",
  "master_id": "34",
  "previous_date": "2026-11-23"
}
```

`company_guid` is the native Tally company GUID, not the Server's company ID or private company key. The company name and GUID must match exactly one registered company for the authenticated client. Register/discover the company using the existing Connector company flow first. The receiver works when Connector is offline.

Voucher actions: `create`, `update`, `cancel`, `delete`. MasterID is a positive integer string. Saved vouchers may use `voucher_guid` instead when MasterID is unavailable; deletions require MasterID. Optional `previous_date` uses YYYY-MM-DD. Master notifications use `entity: "masters"` and `action: "update"` without MasterID.

Tally XML is also supported with `Content-Type: text/xml` or `application/xml`, UTF-8 or UTF-16LE, maximum 16 KB:

```xml
<FLOWUPSNOTIFICATION>
  <COMPANY>Demo &amp; Co</COMPANY>
  <COMPANY_GUID>11111111-2222-3333-4444-555555555555</COMPANY_GUID>
  <MASTER_ID>34</MASTER_ID>
  <ACTION>update</ACTION>
  <PREVIOUS_DATE>20261123</PREVIOUS_DATE>
</FLOWUPSNOTIFICATION>
```

A successful JSON request returns HTTP 200 with `success: true` and `notification` containing `notification_id`, `company_id`, `status: "received"`, and `received_at`. XML requests return a Tally ENVELOPE with STATUS 1 after storage succeeds. Authentication failures return 401, invalid payloads 400, unknown companies 404, ambiguous companies 409, unsupported media types 415. Errors use the existing JSON error envelope.

Receipts are persisted in MongoDB `tally_notifications`. Successful receipts appear as `Tally notification received` in the Server console log. An HTTP receipt confirms storage, not completed sync. Notifications remain `received` until Connector acknowledges durable local queue insertion; they then become `delivered` with `delivered_at`. Delivery is attempted immediately, on authenticated Connector registration, and on its heartbeat. Offline, timed-out and unsupported old Connectors leave the notification pending.

The socket payload contains notification_id, client_id, company_id, company name, native company_guid, private company_key when registered, entity, action, and MasterID/voucher GUID/previous date when available. It contains no API credentials. Connector verifies client scope and uses the existing targeted voucher refresh for create/update/delete/cancel. Master notifications use the company's existing master cache refresh. Initial-sync and opening-refresh prerequisites still apply; the existing worker handles recoverable errors and retries.

Server socket retries preserve notification_id. Connector records IDs in its scoped SQLite receipt table atomically with queue insertion, so a lost acknowledgement cannot queue the same delivery twice, including after local completion. Separate HTTP posts create separate receipt IDs. `delivered` means queued locally, not synced successfully. Check Connector logs for `Server notification received` and then `Local voucher cache updated` (or deletion/master-refresh result). Both updated Server and Connector code are required; installed Connector builds must be rebuilt and updated.

Use `Connector/tally-addon/FlowupsServerNotifications.tdl` for cloud delivery. It has separate Server URL, Client ID and API Key settings and must be loaded instead of the local `FlowupsVoucherNotifications.tdl`. Do not put API keys in URL query parameters. Tally report ENVELOPE wrappers and empty optional XML fields are accepted.
