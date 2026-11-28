# Cached item sales comparison — split companies and financial years

POST `/api/v1/item-sales-comparison` returns JSON. POST `/api/v1/item-sales-comparison/pdf` returns a downloadable PDF with the same payload. Use the existing X-Client-ID and X-API-Key headers. Connector 0.2.18+ supports both comparison types and must be connected to Server. Tally may be closed: report requests read published SQLite caches only, without live discovery, voucher exports, automatic sync or opening-history calculations.

```json
{
  "company_ids": ["02", "03"],
  "comparison_type": "year-wise",
  "match_by": "item_code",
  "sales_basis": "gross",
  "item_code": "RG001"
}
```

Date fields are optional. When omitted, each company uses its own complete snapshot period. For example, company 02 can supply 2025-04-01 through 2026-03-31, and its split successor 03 can supply 2026-04-01 through 2027-03-31. The API does not infer a year from a company name, extend cache coverage or apply today's FY to an older cache. Verify the saved dates in Saved Data. Previously published periods remain readable during refresh; staged/incomplete records are excluded.

- Exactly two distinct public company IDs are required, authorized against the authenticated client before report work. A/B order follows company_ids; differences are B minus A. Private company keys isolate split copies even when native company/item GUIDs are copied. No IDs are reassigned.
- Optional item_code selects the primary Part No. separately in each company's published stock masters. Omit it for all saved stock items, including zero-sales rows. Empty/null/non-string codes are invalid. If absent in one company that side is zero; absent in both returns 404. Filtered totals cover only the selected item.
- match_by defaults to item_code. Use stock_item to align by name, including catalogs without codes. Normalized/trimmed case-insensitive identities are used; no automatic name fallback, unit conversion or ambiguous-code merge is performed. Unique codes are required in code mode.
- sales_basis defaults to gross: Sales and custom types derived from Sales only. Purchases, orders, cancelled/optional rows, opening balances and stock carry-forward are excluded. Explicit net mode deducts cached inventory Credit Note returns. These are item-line values, excluding separate tax, charges and invoice round-off; not invoice grand totals.

## Independent subperiods

To compare the same months of different financial years, optionally supply a period for each company. Each must lie entirely inside that company's published cache:

```json
{
  "company_ids": ["02", "03"],
  "company_periods": [
    { "company_id": "02", "from_date": "2025-04-01", "to_date": "2025-10-31" },
    { "company_id": "03", "from_date": "2026-04-01", "to_date": "2026-10-31" }
  ],
  "match_by": "item_code",
  "sales_basis": "gross"
}
```

Common top-level from_date/to_date remain supported for callers comparing the same dates; both caches must cover them. Do not combine common dates with company_periods. Dates are inclusive YYYY-MM-DD within 1900–2099. Both fields are required when overriding a period. The API never extrapolates incomplete current-year sales or silently uses unsynced history.

## Comparison type

`comparison_type` accepts `year-wise` (default when omitted) or `month-wise`. Year-wise keeps the existing combined summary for each company's selected saved period; it does not force a full year or change supplied dates. Month-wise retains this overall summary and adds `data.months`, ordered April through March. Each month contains its own company dates, item rows, totals, and comparison availability. April 2025 is compared with April 2026 for split FY caches; January rolls into the corresponding next calendar year. Further financial years have an explicit year number in the month label.

```json
{
  "company_ids": ["02", "03"],
  "comparison_type": "month-wise",
  "match_by": "item_code",
  "sales_basis": "gross",
  "item_code": "RG001"
}
```

Omit `item_code` to compare all stock items. Optional `company_periods` work with either type. No extra sync is needed for monthly grouping when the existing cache already supports the comparison. Connector scans the saved vouchers once and returns compact, sparse monthly totals; the Server fills zero-sales rows only inside covered months. A month outside either company's selected period has `comparison_available: false`, empty `rows`/`totals`, null difference and an explanatory message. It is never treated as zero sales. Partial-month dates and a warning are shown. Overall totals still reflect each full selected period. PDF uses the same monthly sections; JSON's existing `data.rows`/`data.totals` remain the overall summary. An older Connector that cannot return monthly data is rejected explicitly.

## JSON and PDF

PDF change columns show positive magnitudes with Increase / Decrease labels, or No change for zero, so a decrease is explained without a minus figure. The existing JSON difference fields retain signed B-minus-A numbers for calculation compatibility. Incomparable values still display an em dash in the PDF.

The standard success envelope contains data.companies, data.rows, data.totals, total_items, warnings, request_ids, item_code and period_mode. Every company includes its comparison dates, saved dates, source=local_cache, last_synced_at and cache_updated_at. Top-level dates are null when the two periods differ; the per-company dates remain explicit. JSON and PDF show separate company values and B−A differences. Items with no activity remain zero; has_sales is false. Zero-base percentages are null. Quantities are grouped by unit; incompatible units have null differences. Missing/different cached currencies produce null amount differences with a warning, while each company's amounts remain visible. No currency is guessed or converted. Units for an unsold legacy master may be unavailable; no unit is invented.

The results reflect the last saved cache, not unsynced Tally edits. Two sequential company reads are not a cross-company atomic snapshot; each cache timestamp is shown. Connector must remain online because SQLite is local, even though Tally can be closed. Scoping remains Server URL + Client ID + configured Tally URL; caches from other clients or unknown port scopes are never combined.

## Existing caches and sync

New syncs persist voucher-type ancestry and cached company currency with the same verified voucher snapshot. Inventory direction is retained for new/changed vouchers. Reports may reuse an older verified catch-up catalog only for the exact company/period and after that snapshot's publication. Standard voucher types and preserved signed quantities remain readable in older detailed caches. Missing custom-type metadata produces an explicit resume-sync message instead of guessing Sales from a name. Existing vouchers are retained and unchanged detail signatures are reused. Old zero-quantity value lines lacking direction, or pre-detail snapshots, require a targeted detail refresh; incompleteDetails selects affected vouchers rather than discarding the database. No report request performs that refresh automatically.

Company selection in Sync restores its saved voucher period. A never-synced company still defaults to current FY; review dates for the first sync of an older company. Incomplete/master-only snapshots return a clear cache-not-ready error; a later failed refresh retains the earlier complete snapshot.

## Implementation and validation

Server module: src/modules/item-sales-comparison (including the period helper), existing routes/job registry and report handlers. Connector: cachedItemSales.model.js, the cache-only itemSales.service.js adapter, ledgerSync publication metadata and the existing socket dispatcher. SQL lives in the model, uses parameters and a consistent read savepoint. No Tally import is performed.

Tests cover copied-GUID company isolation, separate FYs, explicit coverage, code/name selection, zero rows, monthly alignment and reconciliation, cache reads during sync, old-metadata fallback, incomplete detail detection, no native report calls and 100,000 cached vouchers. Local fixtures do not establish client-PC duration or native runtime behavior. Deploy updated Server and Connector 0.2.18+ together for month-wise output; older live-report clients are rejected by the source/period checks. No installer publication or deployment is included in this source change.
