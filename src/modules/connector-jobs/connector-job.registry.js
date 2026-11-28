import { SOCKET_EVENTS } from "../../socket/utils/events.js";

const report = (label, requireTally = false) => ({
  label,
  requireTally,
  event: SOCKET_EVENTS.ledgerStatementFetch,
  report: true,
});
export const connectorJobTypes = Object.freeze({
  ledger_create: {
    label: "Ledger Creation",
    event: SOCKET_EVENTS.ledgerCreate,
    action: "ledger.create",
    requireTally: true,
  },
  mfg_journal: {
    label: "MFG Journal",
    event: SOCKET_EVENTS.mfgJournalPush,
    action: "mfg_journal.push",
    requireTally: true,
  },
  sales_order: {
    label: "Sales Order",
    event: SOCKET_EVENTS.salesOrderPush,
    action: "sales_order.push",
    requireTally: true,
  },
  sales_voucher: {
    label: "Sales Voucher",
    event: SOCKET_EVENTS.salesVoucherPush,
    action: "sales.push",
    requireTally: true,
  },
  receipt_voucher: {
    label: "Receipt Voucher",
    event: SOCKET_EVENTS.receiptVoucherPush,
    action: "receipt.push",
    requireTally: true,
  },
  purchase_order: {
    label: "Purchase Order",
    event: SOCKET_EVENTS.purchaseOrderPush,
    action: "purchase_order.push",
    requireTally: true,
  },
  purchase_voucher: {
    label: "Purchase Voucher",
    event: SOCKET_EVENTS.purchaseVoucherPush,
    action: "purchase.push",
    requireTally: true,
  },
  payment_voucher: {
    label: "Payment Voucher",
    event: SOCKET_EVENTS.paymentVoucherPush,
    action: "payment.push",
    requireTally: true,
  },
  sales_order_lookup: {
    label: "Sales Order lookup",
    event: SOCKET_EVENTS.salesOrderFetch,
    requireTally: true,
  },
  sales_voucher_lookup: {
    label: "Sales Voucher lookup",
    event: SOCKET_EVENTS.salesOrderFetch,
    requireTally: true,
  },
  ledger_statement: report("Ledger Statement"),
  group_summary: report("Group Summary"),
  group_list: report("Accounting Groups", true),
  master_data: report("Tally master data", true),
  outstanding: report("Outstanding"),
  stock_item_movement: report("Stock Item Movement Analysis", true),
  item_sales: report("Cached Item Sales"),
});

export function getConnectorJobType(type = "sales_order") {
  const config = Object.hasOwn(connectorJobTypes, type) ? connectorJobTypes[type] : undefined;
  if (!config) throw new TypeError(`Unsupported Connector job type '${type}'.`);
  return config;
}

export function connectorJobNeedsTally(request, { syncing = false } = {}) {
  const type = request.transaction_type || "sales_order";
  const config = getConnectorJobType(type);
  if (syncing) return false; // Foreground Connector job performs the live validation.
  // Ledger lists can use an already verified Connector snapshot while Tally
  // is occupied by sync. Other master catalogs still require a live export.
  if (type === "master_data" && request.lookup?.catalog === "ledgers") return false;
  return config.requireTally;
}

/** Used for both first delivery and replay after a Connector reconnects. */
export function connectorJobSignal(request) {
  const config = getConnectorJobType(request.transaction_type);
  return {
    event: config.event,
    payload: {
      request_id: request.request_id,
      ...(config.report ? { transaction_type: request.transaction_type } : {}),
      ...(config.action ? { action: config.action } : {}),
    },
  };
}
