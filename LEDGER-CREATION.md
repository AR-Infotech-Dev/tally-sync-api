# Ledger Creation API

Requires the updated Server and Connector **0.2.4+**, an online Connector and the selected company open on its configured Tally URL. This endpoint creates one ledger; it does not alter an existing ledger. A first local accounting sync is not required for creation, but reports still need their initial company sync.

## Create

`POST /api/v1/ledgers/create`

Use existing `X-Client-ID` and `X-API-Key` authentication.

```json
{
  "idempotency_key": "ledger-AH0003-001",
  "destination": { "company_id": "02" },
  "ledger": {
    "name": "ABC Traders",
    "parent": "Sundry Debtors",
    "dealer_code": "AH0003",
    "bill_wise": true
  }
}
```

`idempotency_key`, `destination.company_id`, `ledger.name` and `ledger.parent` are required. The parent group must exist. `dealer_code` is optional and maps to the project's Tally Narration field; non-empty codes are checked for duplicates within the selected company. `bill_wise` is a JSON boolean, defaults to false and sets Maintain balances bill-by-bill. It does not provide historical bill references.

This first version rejects unsupported fields rather than silently ignoring opening balances, opening bills, GSTIN, PAN, address or contact details. It never creates a parent group automatically.

The endpoint waits for the Connector's result, following the existing Create APIs. HTTP 200 includes `request_id`, `status`, `duplicate`, `transaction_type: "ledger_create"`, `ledger` and `tally_result`. The verified ledger includes its native `master_id`, `guid`, name, parent, dealer code and bill-wise flag. `LASTMID` is not assumed to be populated; identity comes from read-back. No voucher-number fields are returned.

## Status and retry

`GET /api/v1/ledgers/create/{requestId}/status`

Use the same client headers. Status is client-scoped, does not require the Connector to be online, and never imports anything. The existing `/ledgers/{requestId}/status` route remains the Ledger Statement status endpoint.

- HTTP 400: invalid/unsupported payload fields, with field-level errors.
- HTTP 401: invalid client credentials.
- HTTP 404: company/request not found for this client.
- HTTP 409: `LEDGER_ALREADY_EXISTS`, `DEALER_CODE_CONFLICT`, `LEDGER_PARENT_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, `LEDGER_IMPORT_REJECTED` or `LEDGER_CREATE_OUTCOME_UNKNOWN`.
- HTTP 503: Connector/Tally unavailable, local creation journal unavailable or `SYNC_BUSY`.
- HTTP 504: waiting deadline expired; use `request_id` to read status before retrying.

Reuse an idempotency key only for the same normalized payload and company. Changing either returns an idempotency conflict. Normal terminal results are returned again without importing. Repeating a request whose outcome is unknown requeues **verification only**; the Server import claim and local journal prohibit another automatic Tally import. A new key is a new operation, not a remedy for an uncertain earlier import.

## Import and verification safeguards

The Connector serializes ledger creation jobs, takes the shared Tally-operation guard, checks company identity before/after exports and immediately before import, and checks the current ledger catalogue and group list. Ledger exports contain only identity/classification/code/flag fields, never voucher details or financial history. A catalogue exceeding the transport response cap fails before import rather than being truncated or treated as empty.

Before import, an atomic client-scoped MongoDB claim records `ledger_import_attempted_at` on the existing job. Only one claim grants permission to send XML. This protects retries on another Connector or after app-data loss. The SQLite `cache_ledger_creates` journal, scoped to client/server/Tally URL and request, also records prepared/sending/verification/rejection states and payload hashes. Keep both the request record and local app data; normal request-retention rules still apply.

Import uses `All Masters`, `Action="Create"`, the explicit selected company and `IMPORTDUPS=@@DUPIGNORECOMBINE`. Exactly one created record, no altered/combined/ignored/error/exception records, and matching read-back fields are required for a normal success. A response lost after an attempted import can still return success if the matching ledger is read back: `verified=true`, `created=null`, `recovered=true`, `outcome="verified_after_uncertain_import"`. This proves the requested state exists; it does not prove which concurrent actor created it. Never overwrite/delete another ledger to resolve a conflict automatically.

Missing, conflicting or unreadable confirmation returns `LEDGER_CREATE_OUTCOME_UNKNOWN` and preserves the import claim. A Tally validation rejection is separate from an uncertain network/verification outcome. Native customizations and manual users can still introduce concurrent changes; preflight dealer-code checks are not a Tally-enforced uniqueness constraint.

## Cache update

After verification, Connector directly queues a company-scoped master refresh. It does not depend on a manual Tally Form Accept hook firing for an XML import. `tally_result.cache_update.status` is `queued`, `pending` after queue failure, or `initial_sync_required` when the company has no usable local snapshot. A queued refresh is asynchronous and is not a guarantee that every report is already updated. Cache queue failure does not repeat a successful Tally import.

## Internal Connector endpoints

- `GET /api/v1/ledgers/create/{requestId}/connector`
- `POST /api/v1/ledgers/create/{requestId}/connector/claim`

These use `X-Client-ID` plus `X-Connector-Key` and accept only ledger-creation requests belonging to that client. The Socket.IO event is `ledger:create`; existing job-update infrastructure carries `transaction_type: "ledger_create"`. Existing voucher/report routes and events are retained.

## Validation evidence

Automated tests exercise validation, normalized idempotency conflicts, claim exclusivity, client-scoped HTTP Create/Status, real Socket.IO delivery and Connector fetch/claim HTTP calls, real SQLite journal persistence, Tally XML import/read-back against a local HTTP simulator, duplicate/group checks, lost responses, restart/app-data-loss recovery, rejected/altered/no-op import summaries, incorrect read-back fields, sync exclusion and cache-queue failure. The simulator models documented native XML, not the client's actual Tally release or custom TCPs. Live Tally creation, permissions, import-duplicate behavior and production deployment remain unverified until client testing.

Native reference: https://help.tallysolutions.com/article/DeveloperReference/integration-capabilities/case_study_1.htm
