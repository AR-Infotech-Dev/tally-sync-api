# Client company sequence IDs

Company IDs are assigned by Server separately for each client: "01", "02", ... "99", "100". They are strings; preserve leading zeros. A second client starts its own list at "01".

The API company_id is not a Tally GUID and is never a position in a live company list. Server stores its immutable mapping to the Tally GUID in MongoDB client_companies, with an atomic per-client counter in client_company_counters. Sync order, company rename, closing/reopening Tally and Connector reinstall do not renumber existing companies. Reinstall with the same client credentials and retain the Server database to preserve the mapping. A different Tally GUID is a new company identity.

GET /api/v1/companies returns this authenticated client's companies, including previously discovered closed companies. Each company must be discovered open at least once. Active means confirmed open, closed means absent from current discovery, unknown means availability could not be checked. Local accounting sync need not finish before company discovery and ID assignment.

Push requests use destination.company_id; reports use top-level company_id; voucher/PDF lookups use the company_id query parameter. Example:

```json
{ "destination": { "company_id": "01" } }
```

Server first resolves "01" within the authenticated client's registry. It attaches the mapped company_guid internally to the Connector job. Caller-supplied names or GUIDs cannot override that mapping. Connector verifies that mapped GUID is currently open before party/item lookup and execution. It never treats "01" as the first open company. Cached reports still require the target company to be open and its local snapshot ready.

Existing registry rows with GUID-based IDs are migrated once to sequence IDs. Read /companies again and update integrations to the new IDs. Public requests no longer accept GUID or COMP_... values as company_id. Previously queued jobs without the Server GUID mapping stop with COMPANY_MAPPING_REQUIRED instead of guessing a company.

IDs are never reused or compressed. Concurrent reservations or failed inserts may leave gaps. At least two digits are used; 100 remains "100". The unique client_id/company_id and client_id/tally_guid indexes prevent duplicate assignments. Two companies with the same name receive separate IDs. If both are open simultaneously, COMPANY_AMBIGUOUS blocks the name-addressed Tally XML transport. Duplicate GUIDs are rejected; a GUID alone cannot distinguish cloned data retaining that GUID.

Missing ID returns 400 COMPANY_ID_REQUIRED, unknown ID for this client returns 404 COMPANY_NOT_FOUND, and a known closed company returns 409 COMPANY_NOT_OPEN. Connection failures prevent execution. The Connector has no selected-company fallback and syncs all open companies sequentially.

Update Server and Connector together. Test Tally displays Server-assigned IDs when connected; before connection it shows that assignment is pending. Keep the company registry and counter collections in Server backups.
