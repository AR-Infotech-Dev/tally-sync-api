import { isDeepStrictEqual } from "node:util";

export function normalizeMfgJournal(journal) {
  const { voucher_date, ...data } = journal;
  return {
    ...data,
    date: journal.date || voucher_date,
    production: Array.isArray(journal.production) ? journal.production[0] : journal.production,
    by_product:
      journal.by_product ?? (Array.isArray(journal.production) ? journal.production.slice(1) : []),
    voucher_type: journal.voucher_type || "Stock Journal",
  };
}

export function assertMfgJournalReplay(existing, input) {
  if (input.transaction_type !== "mfg_journal" && existing.transaction_type !== "mfg_journal")
    return;
  if (
    existing.transaction_type !== input.transaction_type ||
    existing.destination?.company_id !== input.destination?.company_id ||
    existing.destination?.company_guid !== input.destination?.company_guid ||
    !isDeepStrictEqual(
      normalizeMfgJournal(existing.mfg_journal || {}),
      normalizeMfgJournal(input.mfg_journal || {}),
    )
  ) {
    throw Object.assign(
      new Error(
        "This idempotency_key belongs to a different MFG request. Use the original payload or a new key.",
      ),
      {
        status: 409,
        apiCode: 2012,
        data: { error_code: "IDEMPOTENCY_CONFLICT", request_id: existing.request_id },
      },
    );
  }
}
