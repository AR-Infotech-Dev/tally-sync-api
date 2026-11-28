# MFG Journal API

The Server and desktop Connector both need these changes. Restart both for local
testing. Existing released Connector installers do not handle the new events.
No company data or voucher is changed by installing this code alone.

## Public endpoints

All requests use `X-Client-ID` and `X-API-Key` headers.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/mfg-journals/push` | Create an MFG journal through the Connector |
| GET | `/api/v1/mfg-journals/:requestId` | Read the saved request and Tally result |
| GET | `/api/v1/mfg-journals/:requestId/pdf` | Request/download PDF for a succeeded push |
| GET | `/api/v1/mfg-journals/pdf?company_id=01&voucher_type=Stock%20Journal&voucher_no=1&voucher_date=2026-11-26` | Request/download an existing MFG journal by its Tally number |

The number lookup requires `company_id`, `voucher_type` and `voucher_no`.
`voucher_date` is optional but is needed when numbers repeat across years.
No customer/party ledger is required. Lookup only selects manufacturing journals
under the Stock Journal voucher family, excludes cancelled/optional vouchers,
and rejects multiple matches.

## Push example

Replace the company, stock item names, units, godowns and batch names with masters
that already exist in the selected Tally company. `Stock Journal` is the default
voucher type. An existing custom type under Stock Journal can also be supplied.

```json
{
  "destination": {
    "company_id": "01"
  },
  "idempotency_key": "production-order-with-byproduct-001",
  "mfg_journal": {
    "voucher_type": "MFG Journal",
    "date": "2026-11-26",
    "narration": "Manufacture 10 laptops with by-product",
    "production": {
      "stock_item": "Dell Laptop 15-inch",
      "quantity": 10,
      "unit": "Nos",
      "godown": "Main Location"
    },
    "consumption": [
      {
        "stock_item": "Product A",
        "quantity": 10,
        "unit": "Nos",
        "rate": 100,
        "godown": "Main Location"
      }
    ],
    "by_product": [
      {
        "stock_item": "By Product Item",
        "type": "by_product",
        "quantity": 1,
        "unit": "Nos",
        "cost_allocation_percent": 10,
        "godown": "Main Location"
      }
    ],
    "additional_costs": [
      {
        "ledger_name": "Purchase",
        "amount": 100
      }
    ]
  }
}
```

The manufacturing payload has three separate sections:

| Key | JSON type | Purpose |
| --- | --- | --- |
| `production` | Object | One main finished product; marked `ISPRIMARYITEM=Yes` in Tally XML |
| `consumption` | Array | Raw material lines; at least one required |
| `by_product` | Array | Optional additional outputs; defaults to `[]` |

Each `by_product` line may use `type: "co_product"`, `"by_product"` (default when
omitted), or `"scrap"`. These are non-primary inward entries; scrap also gets
`ISSCRAP=Yes`. Co-products and by-products share Tally's combined output section.
A legacy one-element `production` array is still accepted; migrate new callers to
the object form. Move extra production lines into `by_product`; a multi-element
`production` array is rejected instead of guessing the primary item.

Each inventory line requires an exact `stock_item` name (aliases `item_name` /
`name` are accepted), or an `item_code` resolved by the Connector's local stock-item
cache. Codes work in all three sections. Quantity must be positive and `unit`
must match the stock item. Input quantities/amounts are positive; XML applies
inward/outward debit/credit signs to amounts and keeps quantities positive.

Consumption lines need a non-negative `rate` or `amount`. By-products need a rate,
amount, or `cost_allocation_percent` from 0 to 100. Percentage allocations use the
rounded consumption cost plus additional costs. For the example, effective cost
is 1000 + 100 = 1100; the by-product receives 110 and the main product receives
990 (99 per laptop). The production rate/amount can be omitted to calculate the
remaining cost. A supplied production value that conflicts with percentage-based
allocation is rejected, as are conflicting by-product rates/amounts. Percentage
shares cannot exceed 100 and by-product valuation cannot exceed effective cost.
Mixing percentage and fixed-amount by-products is supported. No percentage is
accepted on the primary product: its remaining share is derived automatically.

Explicit main-product valuations without percentage allocations remain supported.
No BOM expansion or yield calculation is performed. `bom_name` is rejected;
send the actual consumption lines. The XML stores calculated amounts/rates and
primary/scrap flags; live Tally verification of the displayed allocation fields
is still required.

`voucher_number` and `reference` are optional. For automatic numbering use the
returned Tally number, not the submitted number, in subsequent lookups.

For multiple batches/godowns, send separate inventory lines with the appropriate
quantity/rate/amount. Nested `batches` / `batch_allocations` are rejected.
Godown and batch default to `Main Location` and `Primary Batch` when omitted.
Optional dates: `manufactured_on`; optional text: `expiry_period` (Tally format).

Optional additional valuation costs:

```json
{
  "additional_costs": [
    { "ledger_name": "Labour Charges", "amount": 100, "allocation_type": "Appropriate by Value" }
  ]
}
```

Place `additional_costs` inside `mfg_journal`. Supported allocation types are
`Appropriate by Value` (default) and `Appropriate by Qty`. These are Tally valuation
allocations, not a payment or a separate expense voucher. The cost ledger must
already exist. When production valuation is automatic these costs are included in it; when supplying an explicit production valuation include the intended costs yourself.

## Responses and retries

Push follows existing project behavior: the HTTP response waits for the Connector
result. On success it returns HTTP 200, `success: true`, `request_id`,
`transaction_type: "mfg_journal"`, `status: "succeeded"`, `duplicate`, the confirmed
`voucher_number` (or null when read-back was unavailable), and `tally_result`.
Fields are at the JSON root, not nested under `data`.

Use one stable idempotency key per production order. Same key and same payload
returns the original request; a changed payload/company returns HTTP 409. A new
key means a new voucher. A response timeout does not prove Tally rejected the
import: use the returned request ID to read status. Do not blindly push again
after an uncertain Tally timeout or manually replay an accepted voucher.

PDF GET returns HTTP 202 with `request_id` and `pdf_status` while queued/generating.
Poll the same endpoint until it returns HTTP 200 with `Content-Type:
application/pdf`. Failed export returns HTTP 424; after fixing the cause, use
`?retry=true`. PDF retry never re-imports the journal. Request-based PDF returns
404 for missing/wrong-type jobs and 409 for an unfinished/failed push.

PDFs are isolated in `mfg_journal_pdfs`. Ready number-based cache entries can be
downloaded while Tally is offline after company ownership is checked. New exports
need a connected Connector and the correct open Tally company. PDF retention is
`MFG_PDF_RETENTION_DAYS` (default 90 days); request-backed copies also respect the
original request expiry. Stale generation jobs are requeued after ten minutes.
Cached PDFs are snapshots; editing a voucher in Tally does not refresh a ready
cache entry automatically.

## Native PDF compatibility and verification

PDF export uses the saved Tally `LASTVCHID`, or an exact type/number/date lookup,
and invokes a Tally print report. The Connector default is `Stock Journal Print`;
set its `TALLY_MFG_PRINT_REPORT` environment variable to the installed/custom
report name when needed. Tally and Connector must share access to the Connector's
temporary output path, as with the existing Sales native PDF export.

Local tests cover the API contract, job routing, idempotency conflicts, XML
structure/signs, item-code resolution, PDF lookup, cache ownership, offline
downloads and export retries. They do not establish live Tally compatibility.
Validate against a test company and an exported sample MFG voucher before using
production data: check manufacturing mode, consumed/produced quantities, batch
allocation, costing, the assigned number, and native PDF layout/report name.

Reference: [Tally XML integration schema](https://help.tallysolutions.com/sample-xml/)
and [manufacturing journal workflow](https://help.tallysolutions.com/manufacturing-journal/).

Import `docs/MFG-Journal.postman_collection.json` for saved requests and response
checks. Set credentials locally; no secrets are included in the collection.
