# Tally Sync API

## Ledger statements

### PDF preview/download

Use `POST /api/v1/ledgers/statement/pdf` with the same JSON body and `X-Client-ID` / `X-API-Key` headers as the statement API. Alternatively, request `POST /api/v1/ledgers/statement?format=pdf`. Both use the same authenticated local-cache job; no additional Tally export is performed. A successful response is PDF bytes (`Content-Type: application/pdf`, attachment disposition, no-store); failures keep the normal JSON error response. The original statement endpoint still returns JSON by default. In Postman use PDF Preview or Save Response to File. Frontends should request a Blob, then display its object URL in a PDF viewer.

The Server fills `src/templates/ledger-statement.hbs` with Handlebars, converts the rendered HTML using `html-to-pdfmake` and `jsdom`, and generates a PDF Buffer using `pdfmake`. No Chrome, browser download, system fonts or Linux graphics packages are needed. Layout uses supported inline HTML styles and table `data-pdfmake` options; class styles, A4 margins and embedded Noto Latin/Devanagari fonts are configured in `ledger-pdf.service.js`. `ledger-pdf.utils.js` formats the statement data and `ledger-pdf-fonts.utils.js` selects font subsets. The footer remains in `src/templates/pdf-footer.hbs` with `page_number` and `page_count` placeholders. Table headings repeat, entries can span pages, and files are generated in memory. Scripts do not execute, remote resources are blocked, local access is limited to bundled fonts, and all statement values are escaped by Handlebars. Existing PDF API routes and download headers are unchanged.

Ledger statement requests now read the Connector local SQLite snapshot. The Connector syncs all ledger masters and voucher allocations on connection, then checks for changes every 180 seconds. If a company is configured, that company is synced; otherwise all open companies are synced sequentially. No statement request makes a Tally HTTP call.

`POST /api/v1/ledgers/statement` uses the existing client-key authentication and Connector job flow to read normalized ledger movements from the Connector SQLite snapshot. Example body:

```json
{
  "company": "Sai Enterprises",
  "ledger_name": "Anjan Ambare",
  "from_date": "2026-10-01",
  "to_date": "2026-10-31"
}
```

`ledger_name`, `from_date` and `to_date` are required. Dates are inclusive and must be real `YYYY-MM-DD` dates between 1900 and 2099; `from_date <= to_date`. `company` is optional and defaults to the Connector's configured Tally company. Explicit company always takes precedence. Use `X-Client-ID` and `X-API-Key` headers. Update both Server and Connector. Keep the company open during sync. After a successful snapshot, Tally may be offline while the Connector continues serving cached statements.

The successful POST response has a `data` object with company, ledger_name, from_date, to_date, opening_balance, entries, total_debit, total_credit and closing_balance. Each entry has date, voucher_no, voucher_type, master_id, narration, particulars (other ledger names), debit, credit and balance. Balances are `{ "amount": 250, "type": "Dr" }` or `Cr`; zero uses `type: null`. Amounts use two decimal places and the company's base currency. Debit and credit totals cover only the requested period. Opening is the ledger master's opening plus posted movements before from_date; closing is opening plus period debits minus credits. Voucher allocations are matched by ledger name, including entries where the ledger is not the party. Cancelled, optional, order and non-accounting inventory vouchers do not contribute posted ledger entries. Rows sort by date then MasterID. This statement reflects current Tally data and does not reproduce user-selected report display settings or outstanding bill ageing.

The successful data includes source: local_sqlite, last_synced_at, sync_status (ready/syncing/stale) and is_stale. Reads use the last atomically published company snapshot. An uninitialized cache returns 503, missing cached ledger returns 404, and an existing ledger with no movements returns an empty entries array. A sync failure keeps the previous snapshot and marks data stale. The Connector must still be running/registered for the Server API to reach its local database. A 504 returns an internal request_id, readable with GET /api/v1/ledgers/{requestId}/status. MongoDB retention removes request jobs, not the SQLite accounting history.

Sync stores company GUID, ledger opening balances, voucher MasterID/AlterID signatures and normalized ledger allocations. Every cycle exports small full ID manifests plus ledger masters; only changed voucher details are fetched in batches of at most 25, with 250 ms pauses. A second manifest and ledger snapshot verifies the source stayed stable before publishing. Deleted IDs are removed atomically; old edits, cancellations, and ledger renames are reconciled. This is not zero-load synchronization: initial sync and manifest scans still read Tally. Very large exports can exceed existing 5 MB response/timeout limits and fail while preserving the last complete snapshot. Sync coverage starts at the company BooksFrom/StartingFrom date and extends through 2099-12-31; using a date before the books start can make Tally silently fall back to its current financial period and amounts use base-currency two-decimal precision.

SQLite uses WAL under Electron userData/ledger-cache.sqlite. Client/server/Tally endpoint and company GUID isolate stored data. Statements store no prepared per-period copies. Do not put the database on a network share or copy an active WAL database as a backup; use SQLite backup tooling. Local database encryption is not enabled by this change.


## Sales Order push API

For Sales vouchers (including custom types under Sales such as `Sales New`), use `GET /api/v1/sales?company=Sai%20Enterprises&ledger_name=Anjan%20Ambare&voucher_no=44&voucher_date=2026-10-31`. This uses the same authenticated direct Tally lookup flow and returns `vouchers[0].details`. `/sales-orders` continues to retrieve Sales Orders only. No prior import record is required. Update both Server and Connector.

Sales Order status is now `GET /api/v1/sales-orders/:requestId/status`. The former client `GET /sales-orders/:requestId` route has been removed; update CRM callers. The internal Connector payload route remains `GET /sales-orders/:requestId/connector`.

To read an existing Sales Order directly from Tally, call `GET /api/v1/sales-orders?company=Sai%20Enterprises&ledger_name=Customer%20Name&voucher_no=SO-1001` with `X-Client-ID` and `X-API-Key`. Supply optional `voucher_date=YYYY-MM-DD` if numbers repeat across years. No prior MongoDB import record or caller-supplied request ID is needed. The API queues a read-only lookup through the existing Connector job flow and waits for the result. A successful JSON response contains `vouchers[0].company`, `vouchers[0].ledger_name`, `vouchers[0].voucher_no`, and the complete structured voucher in `vouchers[0].details` (lowercase Tally field names; `.LIST` entries are always arrays; attributes are under `_attributes`; text with attributes is under `_text`; scalar values remain strings to preserve identifiers and decimal precision). No match returns 404, multiple matches return 409, upstream failures return 502, and a Connector timeout returns 504 with an internal job ID usable at the status endpoint. Both Server and Connector must be updated; Tally must have the requested company open. Temporary lookup jobs follow request retention and do not serve as the source of future lookups.

`POST /api/v1/sales-orders/push` accepts a CRM Sales Order, keeps the full JSON document in MongoDB, and notifies the registered Connector for the authenticated client with a `sales-order:push` event containing only the `request_id`.

Configure `MONGODB_URI` and `MONGODB_DB_NAME` in `.env` (see `.env.example`). If omitted, the API connects to the local MongoDB instance at `mongodb://127.0.0.1:27017`, database `tally_sync`.

### Request and Sales PDF retention

Sales transaction request documents are retained for 90 days after they reach `succeeded` or `failed`. Set `REQUEST_RETENTION_DAYS` in the Server environment to change that period. MongoDB creates a TTL index on first use and removes expired request documents in the background; deletion can occur later than the exact expiry time. Queued and in-progress requests do not expire.

Sales Voucher PDFs are stored in the separate `sales_voucher_pdfs` collection, not in the request document. Their default retention is 90 days from PDF completion; set `SALES_PDF_RETENTION_DAYS` to change it. Request-ID PDFs expire no later than their source request. Direct Tally lookup PDFs have independent retention; even queued direct lookup jobs receive an expiry. These indexes are created automatically when the feature first accesses each collection. Keep MongoDB storage sized for PDFs.

CRM downloads a Sales Voucher PDF on demand with `GET /api/v1/sales/{requestId}/pdf` and its client API key. The first call returns `202` while the Connector processes the export; call the same endpoint again to receive `application/pdf` after it is ready. After a failed attempt, add `?retry=true` to request another export. Connector uploads use the authenticated `POST /api/v1/sales/{requestId}/pdf/connector` endpoint.

To export directly from Tally, use `GET /api/v1/sales/pdf?company=Your%20Company&ledger_name=Customer%20Name&voucher_no=INV%2F001` with `X-Client-ID` and `X-API-Key`. No prior import or request ID is required. The Connector queries Sales vouchers in the requested company using the exact party ledger and voucher number, resolves the internal MasterID, and exports Tally's Printed Invoice PDF. `party_ledger` and `voucher_number` remain aliases. An optional `voucher_date=YYYY-MM-DD` disambiguates repeated numbers across years. Without a date the lookup searches 1900-01-01 through 2099-12-31. Zero or multiple matches fail the export instead of selecting an arbitrary voucher. The first call returns 202; poll the same URL for PDF bytes, or 424 with the Connector error. Use `retry=true` after correcting a failed lookup/export. Completed PDFs are cached until retention expiry and automatically regenerated after expiry/deletion; credentials and MongoDB must remain available for authentication and temporary jobs. Update both Server and Connector for this flow. The Connector and Tally must be running, with the company open. A failed Tally PDF export is still surfaced as a failure, never replaced with a generated imitation invoice.

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

On success, the API responds with HTTP `200` and returns `request_id`, `status`, `voucher_number`, and `tally_result` after Tally accepts the voucher. Tally failures return HTTP `502`. If no terminal Connector result arrives before `CONNECTOR_RESPONSE_TIMEOUT_MS`, the API returns HTTP `504` with the `request_id`; the saved request remains available through `GET /api/v1/sales-orders/:requestId/status`. Status moves through `queued`, `fetching`, `building_xml`, `pushing`, then `succeeded` or `failed`. The Connector fetch endpoint is internal: `GET /api/v1/sales-orders/:requestId/connector`, authenticated with `X-Client-ID` and `X-Connector-Key`.
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


## Client onboarding and credentials

New accounts use this setup flow: register -> enter the emailed activation code -> test Tally -> select an open company -> complete the first sync -> open Monitor. Connector setup resumes after restart. Existing clients can continue using their existing credentials.

- Application authentication stays `X-Client-ID` plus `X-API-Key`. The API key is the application secret; there is no separate API Secret field.
- Connector authentication uses its own Connector Key, stored encrypted by the desktop app. Never substitute the application API key for it.
- `POST /api/v1/clients/activate-connector` accepts `{ "activation_code": "<code from email>" }`. It returns `client_id`, `connector_id` and `connector_key` with `Cache-Control: no-store`; it never returns the API key.
- Activation codes expire 24 hours after registration and are atomically consumed once. Only the code hash and expiry are stored. Rate limit: 10 attempts per 15 minutes using the existing rate limiter.
- A lost activation response, expired code, or interrupted local save can be recovered using the manual Connector credentials in the same registration email. Existing accounts without activation codes use manual setup.
- Registration emails separate Connector activation, application API headers and manual Connector recovery. Registration responses still contain IDs and email-delivery status only, with no secrets.
- Remote activation requires HTTPS in the desktop client; loopback HTTP is supported for development. The Server must be deployed behind HTTPS for public traffic.
- The registration API still activates the existing account after email delivery; this change does not introduce a separate email-verification link or reset/key-rotation portal.

Verification: `node --test test/*.test.js` in Server and Connector. The onboarding HTTP test uses a local Express endpoint with a synthetic activation repository; it does not send mail or alter production MongoDB. Desktop/mobile previews use synthetic data.

## PDF deployment

Run `npm ci` and deploy the updated Server. The Dockerfile uses Node 22 and JavaScript dependencies only. Previous browser installer services, scripts, package hooks and browser environment options have been removed. The HTML template has been adapted for pdfmake-supported formatting; arbitrary browser CSS (flex/grid/stylesheets) is not supported.

## Order allocation due dates

Sales Orders and Purchase Orders require `order_due_date` in `YYYY-MM-DD` format on the order, or separately on every item. An item value overrides the order-level value. No due date is inferred from the voucher date. Missing or invalid values return field-level validation errors before a job is queued. The Connector serializes both `ORDERNO` and compound `ORDERDUEDATE` within each batch allocation; invoice payloads keep their existing behavior. Example: `"order_number": "6", "order_due_date": "2026-11-07"` (replace with the actual promised date). These fixes do not modify vouchers already held in Tally Import Exceptions. Validate one corrected order before retrying other held copies.
