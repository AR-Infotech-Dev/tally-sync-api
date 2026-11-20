export const normalizeLedgerCreate = (ledger) => ({
  name: ledger.name.trim(),
  parent: ledger.parent.trim(),
  dealer_code: (ledger.dealer_code || "").trim(),
  bill_wise: ledger.bill_wise === true,
});

export function assertLedgerCreateReplay(existing, input) {
  if (input.transaction_type !== "ledger_create" && existing.transaction_type !== "ledger_create")
    return;
  if (
    existing.transaction_type !== "ledger_create" ||
    input.transaction_type !== "ledger_create" ||
    existing.destination?.company_id !== input.destination?.company_id ||
    existing.destination?.company_guid !== input.destination?.company_guid ||
    JSON.stringify(existing.ledger) !== JSON.stringify(input.ledger)
  ) {
    throw Object.assign(
      new Error(
        "This idempotency_key was already used for a different request. Use the original payload or a new key.",
      ),
      {
        status: 409,
        apiCode: 2012,
        data: { error_code: "IDEMPOTENCY_CONFLICT", request_id: existing.request_id },
      },
    );
  }
}
