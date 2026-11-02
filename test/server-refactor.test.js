import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isVoucherDate, isIsoDate, validateReportDates } from "../src/shared/utils/dateValidation.js";
import { matchesCredentialHash } from "../src/shared/utils/credentialHash.js";
import { connectorJobSignal, getConnectorJobType, connectorJobTypes } from "../src/modules/connector-jobs/connector-job.registry.js";
import { SOCKET_EVENTS } from "../src/socket/utils/events.js";
import { createVoucherHandlers } from "../src/shared/http/voucherHandlers.js";
import { createReportHandlers } from "../src/shared/http/reportHandlers.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { asyncHandler } from "../src/shared/utils/asyncHandler.js";
import { validateOutstanding } from "../src/modules/outstanding/outstanding.validator.js";

const request = () => ({ client: { client_id: "CLIENT_A" }, body: { client_id: "CLIENT_B" }, params: { requestId: "REQ_1" }, query: {} });
function response() {
  return {
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    set(value) { this.headers = value; return this; },
  };
}
const invoke = async (handler, req = request(), res = response()) => {
  await handler(req, res, (error) => { throw error; });
  return res;
};
const job = (overrides = {}) => ({ request_id: "REQ_1", status: "succeeded", transaction_type: "sales_voucher", sales_order: { voucher_number: "25" }, tally_result: {}, ...overrides });
function vouchers(completion = { request: job() }, options = {}) {
  return createVoucherHandlers({ label: "Sales Voucher", field: "sales_order", kind: "sales_voucher", validate: () => [], queue: async () => ({ request: job(), duplicate: false }), read: async () => job(), wait: async () => completion, ...options });
}
function reports(result = { request: job({ tally_result: { statement: { company: "A" } } }) }, options = {}) {
  return createReportHandlers({ label: "ledger statement", resultKey: "statement", validate: () => [], request: async () => result, read: async () => job(), generatePdf: async () => Buffer.from("%PDF-test"), filename: () => "statement.pdf", ...options });
}

test("Voucher dates preserve endpoint-specific formats and calendar validation", () => {
  for (const date of ["2026-1-2", "20260102", "2/1/26", " 2026-01-02 ", "2024-02-29"]) assert.equal(isVoucherDate(date), true, date);
  for (const date of ["2026-02-29", "2026-13-01", "31/04/26", "", null, 20260102]) assert.equal(isVoucherDate(date), false, String(date));
  assert.equal(isVoucherDate("2026-1-2", { flexibleYearFirst: false }), false);
  assert.equal(isVoucherDate("2026-01-02", { flexibleYearFirst: false }), true);
});
test("Report dates remain strict and bounded without changing field errors", () => {
  assert.equal(isIsoDate("2026-1-2"), false);
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2100-01-01", { bounded: true }), false);
  assert.equal(isIsoDate("2100-01-01"), true);
  assert.deepEqual(validateReportDates({ from_date: "2026-04-01", to_date: "2026-10-31" }), []);
  assert.deepEqual(validateReportDates({}).map((e) => e.field), ["from_date", "to_date"]);
});
test("Outstanding required-field errors point to the missing input", () => {
  assert.deepEqual(validateOutstanding({ company_id: "COMP_A" }).map((e) => e.field), ["ledger_name"]);
  assert.deepEqual(validateOutstanding({ dealer_code: "AR-01" }).map((e) => e.field), ["company_id"]);
  assert.deepEqual(validateOutstanding({ company_id: "COMP_A", dealer_code: "AR-01" }), []);
});
test("Credential comparison rejects wrong keys and malformed stored hashes", () => {
  const hash = createHash("sha256").update("sample-key").digest("hex");
  assert.equal(matchesCredentialHash("sample-key", hash), true);
  assert.equal(matchesCredentialHash("wrong", hash), false);
  assert.equal(matchesCredentialHash(undefined, hash), false);
  for (const invalid of [null, "", "xyz", "0".repeat(63)]) assert.equal(matchesCredentialHash("sample-key", invalid), false);
});
test("All voucher types preserve socket event and action names", () => {
  const types = [
    ["sales_order", "salesOrderPush", "sales_order.push"], ["sales_voucher", "salesVoucherPush", "sales.push"],
    ["receipt_voucher", "receiptVoucherPush", "receipt.push"], ["purchase_order", "purchaseOrderPush", "purchase_order.push"],
    ["purchase_voucher", "purchaseVoucherPush", "purchase.push"], ["payment_voucher", "paymentVoucherPush", "payment.push"],
  ];
  for (const [type, event, action] of types) {
    assert.deepEqual(connectorJobSignal({ request_id: "R", transaction_type: type }), { event: SOCKET_EVENTS[event], payload: { request_id: "R", action } });
    assert.equal(getConnectorJobType(type).requireTally, true);
  }
});
test("Report and lookup dispatch preserve cached versus live Tally requirements", () => {
  for (const type of ["ledger_statement", "group_summary", "outstanding", "stock_item_movement"]) {
    assert.deepEqual(connectorJobSignal({ request_id: "R", transaction_type: type }), { event: SOCKET_EVENTS.ledgerStatementFetch, payload: { request_id: "R", transaction_type: type } });
    assert.equal(getConnectorJobType(type).requireTally, type === "stock_item_movement");
  }
  for (const type of ["sales_order_lookup", "sales_voucher_lookup"]) assert.deepEqual(connectorJobSignal({ request_id: "R", transaction_type: type }), { event: SOCKET_EVENTS.salesOrderFetch, payload: { request_id: "R" } });
  assert.equal(Object.keys(connectorJobTypes).length, 12);
  assert.equal(getConnectorJobType(), connectorJobTypes.sales_order);
  for (const type of ["unknown", "toString", "__proto__"]) assert.throws(() => getConnectorJobType(type), /Unsupported/);
});
test("Voucher queue uses authenticated client scope and preserves duplicate response", async () => {
  let queued;
  const handler = vouchers(undefined, { queue: async (input) => { queued = input; return { request: job(), duplicate: true }; }, wait: async (client, id) => { assert.equal(client, "CLIENT_A"); assert.equal(id, "REQ_1"); return { request: job() }; } });
  const res = await invoke(handler.push);
  assert.equal(queued.client_id, "CLIENT_A");
  assert.equal(res.body.duplicate, true);
  assert.equal(res.body.voucher_number, null);
  assert.equal(res.body.submitted_voucher_number, "25");
});
test("Only a confirmed Tally voucher number is reported as authoritative", async () => {
  const res = await invoke(vouchers({ request: job({ tally_result: { voucher_number_source: "tally", voucher_number: "T-26", submitted_voucher_number: "S-25" } }) }).push);
  assert.equal(res.body.voucher_number, "T-26");
  assert.equal(res.body.submitted_voucher_number, "S-25");
});
test("Receipt does not treat order_number as submitted voucher number", async () => {
  const res = await invoke(vouchers({ request: job({ receipt: { order_number: "ignored" } }) }, { field: "receipt", allowOrderNumber: false }).push);
  assert.equal(res.body.submitted_voucher_number, null);
});
test("Voucher validation prevents queue writes", async () => {
  const res = await invoke(vouchers(undefined, { validate: () => [{ field: "destination.company_id" }], queue: () => assert.fail("must not queue") }).push);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 2001);
  assert.equal(res.body.errors[0].field, "destination.company_id");
});
for (const status of [404, 409, 502]) test(`Voucher failure retains ${status} status and company error`, async () => {
  const res = await invoke(vouchers({ request: job({ status: "failed", error: "Company not active", tally_result: { lookup_status: status } }) }).push);
  assert.equal(res.statusCode, status);
  assert.equal(res.body.error, "Company not active");
  assert.equal(res.body.message, status === 502 ? "Tally did not accept the Sales Voucher." : "Company not active");
});
test("Purchase failures can retain their Tally result", async () => {
  const tally_result = { lookup_status: 409 };
  const res = await invoke(vouchers({ request: job({ status: "failed", tally_result }) }, { includeFailureResult: true }).push);
  assert.deepEqual(res.body.tally_result, tally_result);
});
test("Voucher timeout, missing request and disconnect remain separate outcomes", async () => {
  assert.equal((await invoke(vouchers({ request: job({ status: "queued" }), timedOut: true }).push)).statusCode, 504);
  assert.equal((await invoke(vouchers({ request: null }).push)).statusCode, 404);
  assert.equal((await invoke(vouchers({ disconnected: true }).push)).body, undefined);
});
test("Voucher status reads use authenticated scope and reject another transaction type", async () => {
  const res = await invoke(vouchers(undefined, { read: async (client, id) => { assert.equal(client, "CLIENT_A"); assert.equal(id, "REQ_1"); return job({ transaction_type: "receipt_voucher" }); } }).getRequest);
  assert.equal(res.statusCode, 404);
});
test("Report JSON preserves data envelope and client scope", async () => {
  const res = await invoke(reports(undefined, { request: async (client, body) => { assert.equal(client, "CLIENT_A"); assert.equal(body.client_id, "CLIENT_B"); return { request: job({ tally_result: { statement: { company: "A" } } }) }; } }).json);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { company: "A" });
});
test("Report PDF passes configuration to renderer and sends binary download", async () => {
  const req = request(); req.body.show_opening_balance = "no";
  const res = await invoke(reports(undefined, { generatePdf: async (data, options) => { assert.equal(data.company, "A"); assert.equal(options.show_opening_balance, "no"); return Buffer.from("%PDF-test"); } }).pdf, req);
  assert.equal(res.headers["Content-Type"], "application/pdf");
  assert.equal(res.headers["Content-Disposition"], 'attachment; filename="statement.pdf"');
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert(Buffer.isBuffer(res.body));
});
test("Ledger format query still requests a PDF", async () => {
  const req = request(); req.query.format = "pdf";
  assert(Buffer.isBuffer((await invoke(reports(undefined, { allowFormatQuery: true }).json, req)).body));
});
test("Failed, timed out and empty reports never invoke PDF renderer", async () => {
  for (const [result, status] of [[{ request: null }, 404], [{ request: job(), timedOut: true }, 504], [{ request: job({ status: "failed", tally_result: { lookup_status: 409 } }) }, 409], [{ request: job() }, 502]]) {
    assert.equal((await invoke(reports(result, { generatePdf: () => assert.fail("must not render") }).pdf)).statusCode, status);
  }
});
test("Disconnected report requests do not write a response", async () => {
  const res = response(); res.destroyed = true;
  await invoke(reports().pdf, request(), res);
  assert.equal(res.body, undefined);
});
test("Report status retains optional result and error fields", async () => {
  const res = await invoke(reports(undefined, { read: async (client) => { assert.equal(client, "CLIENT_A"); return job({ error: "example", tally_result: { statement: { company: "A" } } }); } }).status);
  assert.equal(res.body.error, "example");
  assert.deepEqual(res.body.statement, { company: "A" });
});
test("Unexpected errors return standard envelope and preserve legacy aliases", () => {
  const res = response(); errorHandler(new Error("Example"), {}, res, assert.fail);
  assert.equal(res.statusCode, 500); assert.equal(res.body.success, false);
  assert.equal(res.body.code, 2000); assert.equal(res.body.flag, "F");
  assert.equal(res.body.msg, "Example"); assert.equal(res.body.message, "Example");
});
test("Known API errors retain their existing status, code and details", () => {
  const res = response(); errorHandler(Object.assign(new Error("Company mismatch"), { apiCode: 2012, status: 409, data: { error_code: "COMPANY_MISMATCH" } }), {}, res, assert.fail);
  assert.equal(res.statusCode, 409); assert.equal(res.body.error_code, "COMPANY_MISMATCH");
  assert.equal(res.body.code, 2012);
});
test("Production errors do not expose stack traces", () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const res = response(); errorHandler(new Error("Example"), {}, res, assert.fail);
    assert.equal(Object.hasOwn(res.body, "stack"), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test("Already-started responses delegate errors instead of sending twice", () => {
  const error = new Error("Example"); let received;
  errorHandler(error, {}, { headersSent: true }, (value) => { received = value; });
  assert.equal(received, error);
});
test("Async wrapper forwards synchronous throws and rejected promises", async () => {
  for (const fn of [() => { throw new Error("sync"); }, async () => { throw new Error("async"); }]) {
    let received; await asyncHandler(fn)({}, {}, (error) => { received = error; });
    assert(received instanceof Error);
  }
});
