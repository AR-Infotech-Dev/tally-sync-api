import { queueSalesOrder, readSalesOrder } from "../sales-order/sales.service.js";

const settings = {
  purchase_order: { field: "purchase_order", keyPrefix: "purchase-order", defaultVoucherType: "Purchase Order" },
  purchase_voucher: { field: "purchase", keyPrefix: "purchase-voucher", defaultVoucherType: "Purchase" },
  payment_voucher: { field: "payment", keyPrefix: "payment-voucher", defaultVoucherType: "Payment" },
};

function normalizeVoucher(data, kind) {
  const config = settings[kind];
  const voucher = { ...data, voucher_type: data.voucher_type || config.defaultVoucherType, date: data.date || data.voucher_date };
  const partyLedger = voucher.party?.ledger_name || voucher.party_ledger || voucher.supplier_ledger || voucher.supplier_name;
  if (partyLedger) voucher.party = { ...(voucher.party || {}), ledger_name: partyLedger };
  if (kind === "purchase_order" || kind === "purchase_voucher") {
    const items = voucher.items || voucher.line_items || voucher.lineItems || [];
    const total = Number(voucher.total_amount ?? items.reduce((sum, item) => sum + Number(item.amount ?? Number(item.quantity ?? item.qty) * Number(item.rate ?? item.unit_rate)), 0));
    return {
      ...voucher,
      items: items.map((item) => ({ ...item, purchase_ledger: item.purchase_ledger || voucher.purchase_ledger })),
      total_amount: total,
      ...(kind === "purchase_voucher" ? {
        party_ledger_entry: {
          ...(voucher.party_ledger_entry || {}),
          ledger: voucher.party_ledger_entry?.ledger || partyLedger,
          amount: Math.abs(Number(voucher.party_ledger_entry?.amount ?? total)),
          bill_reference: voucher.party_ledger_entry?.bill_reference || voucher.bill_reference || voucher.voucher_number,
          bill_type: voucher.party_ledger_entry?.bill_type || voucher.bill_type || "New Ref",
        },
      } : {}),
    };
  }
  voucher.payment = { ...(voucher.payment || {}), ledger_name: voucher.payment?.ledger_name || voucher.payment_ledger };
  return voucher;
}

export function queuePurchaseTransaction(input, kind) {
  const config = settings[kind];
  if (!config) throw new TypeError(`Unsupported purchase transaction type '${kind}'.`);
  return queueSalesOrder({
    client_id: input.client_id,
    destination: input.destination,
    idempotency_key: input.idempotency_key ? `${config.keyPrefix}:${input.idempotency_key}` : undefined,
    [config.field]: normalizeVoucher(input[config.field], kind),
    transaction_type: kind,
  });
}

export const readPurchaseTransaction = (clientId, requestId) => readSalesOrder(clientId, requestId);
