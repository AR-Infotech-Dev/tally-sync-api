import { queueSalesOrder, readSalesOrder } from "../sales-order/sales.service.js";

function normalizeSalesVoucher(sales) {
  const items = sales.items || sales.line_items || sales.lineItems || [];
  const partyLedger = sales.party_ledger
    || sales.party_name
    || sales.customer_ledger
    || sales.customer_name
    || sales.party?.ledger_name
    || sales.party_ledger_entry?.ledger;
  const calculatedTotal = items.reduce((total, item) => {
    const amount = item.amount ?? Number(item.quantity ?? item.qty) * Number(item.rate ?? item.unit_rate);
    return total + Number(amount);
  }, 0);
  const totalAmount = Number(sales.total_amount ?? calculatedTotal);
  const existingPartyEntry = sales.party_ledger_entry || {};

  return {
    ...sales,
    voucher_type: sales.voucher_type || "Sales",
    voucher_mode: sales.voucher_mode || "Item Invoice",
    is_invoice: true,
    date: sales.date || sales.voucher_date,
    items: items.map((item) => ({ ...item, sales_ledger: item.sales_ledger || sales.sales_ledger })),
    party_ledger_entry: {
      ...existingPartyEntry,
      ledger: existingPartyEntry.ledger || partyLedger,
      amount: -Math.abs(Number(existingPartyEntry.amount ?? totalAmount)),
      bill_reference: existingPartyEntry.bill_reference || sales.voucher_number || sales.reference,
      bill_type: existingPartyEntry.bill_type || "New Ref",
    },
    total_amount: totalAmount,
  };
}

export async function queueSalesVoucher(input) {
  return queueSalesOrder({
    client_id: input.client_id,
    destination: input.destination,
    idempotency_key: input.idempotency_key ? `sales-voucher:${input.idempotency_key}` : undefined,
    // Keep the persisted field compatible with Connector versions that fetch
    // through the existing sales-orders connector endpoint.
    sales_order: normalizeSalesVoucher(input.sales),
    transaction_type: "sales_voucher",
  });
}

export function readSalesVoucher(clientId, requestId) {
  return readSalesOrder(clientId, requestId);
}
