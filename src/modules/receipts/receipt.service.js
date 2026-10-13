import { queueSalesOrder, readSalesOrder } from "../sales-order/sales.service.js";

function normalizeReceipt(receipt) {
  const amount = Math.abs(Number(receipt.amount));
  const partyLedger = receipt.party?.ledger_name || receipt.party_ledger;
  const paymentLedger = receipt.payment?.ledger_name || receipt.payment_ledger;

  return {
    ...receipt,
    voucher_type: receipt.voucher_type || "Receipt",
    date: receipt.date || receipt.voucher_date,
    party: { ...(receipt.party || {}), ledger_name: partyLedger },
    payment: { ...(receipt.payment || {}), ledger_name: paymentLedger },
    amount,
    ...(receipt.bill_reference
      ? { bill_type: receipt.bill_type || "Agst Ref" }
      : { bill_type: "On Account" }),
  };
}

export function queueReceiptVoucher(input) {
  return queueSalesOrder({
    client_id: input.client_id,
    destination: input.destination,
    idempotency_key: input.idempotency_key ? `receipt-voucher:${input.idempotency_key}` : undefined,
    receipt: normalizeReceipt(input.receipt),
    transaction_type: "receipt_voucher",
  });
}

export function readReceiptVoucher(clientId, requestId) {
  return readSalesOrder(clientId, requestId);
}
