# Tally Sync API

## Sales Order push API

`POST /api/v1/sales-orders/push` accepts a CRM Sales Order, keeps the full JSON document in MongoDB, and notifies the registered Connector for the authenticated client with a `sales-order:push` event containing only the `request_id`.

Configure `MONGODB_URI` and `MONGODB_DB_NAME` in `.env` (see `.env.example`). If omitted, the API connects to the local MongoDB instance at `mongodb://127.0.0.1:27017`, database `tally_sync`.

### Request and Sales PDF retention

Sales transaction request documents are retained for 90 days after they reach `succeeded` or `failed`. Set `REQUEST_RETENTION_DAYS` in the Server environment to change that period. MongoDB creates a TTL index on first use and removes expired request documents in the background; deletion can occur later than the exact expiry time. Queued and in-progress requests do not expire.

Sales Voucher PDFs are stored in the separate `sales_voucher_pdfs` collection, not in the request document. Their default retention is 90 days from PDF completion; set `SALES_PDF_RETENTION_DAYS` to change it. A PDF expires no later than its request record, so it will not be left behind after the CRM can no longer access the request. These indexes are created automatically when the feature first accesses each collection. Keep MongoDB storage sized for PDFs.

CRM downloads a Sales Voucher PDF on demand with `GET /api/v1/sales/{requestId}/pdf` and its client API key. The first call returns `202` while the Connector processes the export; call the same endpoint again to receive `application/pdf` after it is ready. After a failed attempt, add `?retry=true` to request another export. Connector uploads use the authenticated `POST /api/v1/sales/{requestId}/pdf/connector` endpoint.

Example request:

```json
{
  "idempotency_key": "CRM-SO-10001",
  "destination": {
    "company": "Example Company",
    "ledger": "Customer Ledger"
  },
  "sales_order": {
    "order_number": "SO-10001",
    "custom_fields": {
      "delivery_route": "North"
    }
  }
}
```

Send `X-Client-ID` and `X-API-Key` headers. Create a client with `npm run client:create -- CLIENT_001 "Example Client"`; this displays separate CRM and Connector keys once. Store the CRM key in the CRM and enter the Connector key in the Electron Connector configuration. Custom Sales Order fields are retained in the `sales_order` object. Push APIs wait for the Connector's Tally result before returning a final response; the default wait limit is 120 seconds and can be changed with `CONNECTOR_RESPONSE_TIMEOUT_MS`. A Connector reconnect also receives queued request signals.

Fresh workspace for the CRM to TallyPrime sync system.

```text
Tally Sync API's/
├── Connector/   Electron connector for customer Windows PCs
├── Server/      Express + Socket.IO server
└── src/, ...    Existing legacy scaffold retained for reference
```

The existing root-level project is a legacy CallDesk/Ticket Management migration scaffold. It is not used by the new `Server` or `Connector` projects.

## Start the new server

```powershell
cd Server
Copy-Item .env.example .env
npm install
npm run dev
```

Health check: `http://localhost:5000/health`.

## Start the Electron connector

```powershell
cd Connector
npm install
npm run dev
```

Set the server URL, Client ID, and Connector ID, save the configuration, then choose **Connect तपासा**. Configuration is stored in Electron's per-user application data directory. The connector registers over an outbound Socket.IO connection and reports connection/test signal status.

The `tally:sync` listener currently acknowledges signal receipt only. The authenticated job-fetch API, payload contract, Tally XML conversion, TallyPrime HTTP request, and result ACK lifecycle are later integration work; the connector must never have the cloud server call customer `localhost:9000`.
# Client registration

Register a Connector client with `POST /api/v1/clients/register` and JSON fields `name`, `company_name`, `email`, and `tally_license_no`. The server stores only SHA-256 hashes for the CRM API key and Connector key, then emails the two separate credentials to the registered email address. The API response contains the client and connector IDs, but never the keys. Registration is limited to five attempts per IP per hour, and a Tally license number can be registered only once.

Configure `EMAIL_USER` with the Gmail address and `EMAIL_PASS` with its 16-character Google App Password in the server `.env` before accepting registrations. Gmail SMTP is configured by the mailer. Until both values are configured, the registration endpoint returns a service unavailable response. Use the CRM API key in CRM requests with `X-Client-ID` and `X-API-Key`; enter the Connector key in the Connector app.
# Sales Order Push API

Submit a JSON sales order using `POST /api/v1/sales-orders/push` with `X-Client-ID` and `X-API-Key` headers. The request is stored in MongoDB and queued for the registered Connector; the HTTP request stays open until the Connector returns the Tally result.

```json
{
  "idempotency_key": "CRM-SO-1042",
  "destination": { "company_name": "Demo Company" },
  "sales_order": {
    "voucher_number": "SO-1042",
    "date": "2026-10-08",
    "party_ledger": "ABC Customer",
    "items": [
      { "item_name": "Product A", "quantity": 2, "unit": "Nos", "rate": 150 }
    ]
  }
}
```

The `sales_order` object supports nested `party`, `consignee`, `company`, and `party_ledger_entry` blocks, uses `voucher_type` and `voucher_mode`/`is_invoice`, and accepts `items`, `line_items`, or `lineItems`. Each item needs `stock_item` (or `item_name`), `quantity`, and `rate`; optional HSN, taxability, actual quantity, batch/godown, and sales ledger data are included in XML. The configured Tally company name in Connector settings takes precedence over `destination.company` or `destination.company_name`. Optional `custom_fields` can be supplied on the order/header; keys must match Tally's UDF technical field names and values must be scalar JSON values.

On success, the API responds with HTTP `200` and returns `request_id`, `status`, `voucher_number`, and `tally_result` after Tally accepts the voucher. Tally failures return HTTP `502`. If no terminal Connector result arrives before `CONNECTOR_RESPONSE_TIMEOUT_MS`, the API returns HTTP `504` with the `request_id`; the saved request remains available through `GET /api/v1/sales-orders/:requestId`. Status moves through `queued`, `fetching`, `building_xml`, `pushing`, then `succeeded` or `failed`. The Connector fetch endpoint is internal: `GET /api/v1/sales-orders/:requestId/connector`, authenticated with `X-Client-ID` and `X-Connector-Key`.
# tally-sync-api

# Admin Console

Open the Server operations console at `/console` (local: `http://localhost:3000/console`; production: `https://sync.flowups.in/console`). The page shows server runtime, MongoDB availability, authenticated Connector socket registrations, Sales Order job status, and recent HTTP/socket/job activity. It refreshes the snapshot every 15 seconds.

Set these variables in the Server environment before signing in:

- `CONSOLE_USERNAME`: the admin login name.
- `CONSOLE_PASSWORD`: a strong password with at least 16 characters.
- `CONSOLE_SESSION_SECRET`: optional, recommended long random value used to sign sessions independently of the password.

In Coolify, add them to the Server application's environment variables and redeploy/restart the Server. For local use, set them in `Server/.env` and restart `npm run dev`. Keep these values private. The console uses an HTTP-only, same-site session cookie and limits login attempts. Recent activity logs are kept in memory and reset when the Server restarts; job details are read from MongoDB. Voucher payloads and API keys are not exposed in the console.

# Sales Voucher API

Submit an invoice Sales Voucher with `POST /api/v1/sales/push` and the client headers `X-Client-ID` and `X-API-Key`. The Server stores the voucher request in MongoDB, signals the registered Connector, and keeps the CRM request open until Tally responds.

```json
{
  "idempotency_key": "CRM-SALES-2026-001",
  "destination": { "company": "Sai Enterprises" },
  "sales": {
    "voucher_type": "Sales",
    "voucher_mode": "Item Invoice",
    "voucher_number": "24",
    "date": "2026-10-12",
    "party": { "ledger_name": "Anjan Ambare" },
    "items": [
      {
        "stock_item": "Product A",
        "quantity": 2,
        "unit": "Nos",
        "rate": 500,
        "amount": 1000,
        "sales_ledger": "Sales"
      }
    ],
    "total_amount": 1000
  }
}
```

`date`, customer ledger, at least one stock item, positive quantity, and a valid rate are required. `voucher_type` defaults to `Sales`; use the exact voucher type name configured in Tally if it differs. The Connector uses its configured Tally company when present, otherwise `destination.company` / `destination.company_name`. The party ledger amount is derived as the negative total when not supplied.

If the CRM connection times out before a final response, retrieve the saved result with `GET /api/v1/sales/:requestId` using the same client headers. The Connector-only fetch endpoint is `GET /api/v1/sales/:requestId/connector` with `X-Client-ID` and `X-Connector-Key`.
