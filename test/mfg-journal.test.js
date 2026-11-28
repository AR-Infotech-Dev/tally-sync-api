import test from "node:test";
import assert from "node:assert/strict";
import { validateMfgJournalRequest } from "../src/modules/mfg_journal/mfg-journal.validator.js";
import {
  normalizeMfgJournal,
  assertMfgJournalReplay,
} from "../src/modules/mfg_journal/mfg-journal.contract.js";
import { validateMfgPdfLookup } from "../src/modules/mfg_journal/mfg-journal.lookup.validator.js";
import {
  createMfgPdfByNumberRequester,
  createMfgPdfRequester,
} from "../src/modules/mfg_journal/mfg-journal-pdf.service.js";
import { connectorJobSignal } from "../src/modules/connector-jobs/connector-job.registry.js";

const journal = () => ({
  date: "2026-11-26",
  consumption: [{ stock_item: "Raw material", quantity: 10, unit: "Kg", rate: 100 }],
  production: [{ stock_item: "Finished goods", quantity: 5, unit: "Nos", rate: 200 }],
});
const request = () => ({
  destination: { company_id: "01" },
  idempotency_key: "mfg-1",
  mfg_journal: journal(),
});
const target = { company_id: "01", company_guid: "guid-01", company: "Demo" };

test("MFG contract needs consumption/production, not sales ledgers or party", () => {
  assert.deepEqual(validateMfgJournalRequest(request()), []);
  assert.deepEqual(
    validateMfgJournalRequest({
      ...request(),
      mfg_journal: { ...journal(), additional_costs: [{ ledger_name: "Labour", amount: 100 }] },
    }),
    [],
  );
  for (const invalid of [
    null,
    [],
    {},
    { sales: {} },
    { ...request(), destination: { company_id: "" } },
    { ...request(), mfg_journal: { ...journal(), consumption: [] } },
  ])
    assert.ok(validateMfgJournalRequest(invalid).length);
});

test("MFG validation rejects invalid dates, numeric coercion, malformed items and multi-batch payloads", () => {
  for (const date of ["2026-02-29", "2026-13-01", ""])
    assert.ok(
      validateMfgJournalRequest({ ...request(), mfg_journal: { ...journal(), date } }).length,
    );
  for (const quantity of [true, false, "", " ", 0, -1, "NaN", Infinity, [], {}]) {
    const value = request();
    value.mfg_journal.consumption[0].quantity = quantity;
    assert.ok(validateMfgJournalRequest(value).length, String(quantity));
  }
  for (const change of [
    { unit: "" },
    { rate: null },
    { rate: -1 },
    { amount: -100 },
    { batch_allocations: [] },
    { manufactured_on: "2026-02-30" },
    { stock_item: "bad\u0000name" },
  ]) {
    const value = request();
    Object.assign(value.mfg_journal.production[0], change);
    assert.ok(validateMfgJournalRequest(value).length, JSON.stringify(change));
  }
  const code = request();
  code.mfg_journal.consumption[0] = { item_code: "RM-01", quantity: "2.5", rate: "20", unit: "Kg" };
  assert.deepEqual(validateMfgJournalRequest(code), []);
});

test("MFG idempotency rejects changed company or production, accepts reordered JSON keys", () => {
  const input = {
    transaction_type: "mfg_journal",
    destination: target,
    mfg_journal: normalizeMfgJournal(journal()),
  };
  const existing = { ...input, request_id: "REQ" };
  assert.doesNotThrow(() =>
    assertMfgJournalReplay(existing, {
      ...input,
      mfg_journal: Object.fromEntries(Object.entries(input.mfg_journal).reverse()),
    }),
  );
  for (const changed of [
    { ...input, destination: { ...target, company_guid: "other" } },
    { ...input, mfg_journal: { ...input.mfg_journal, narration: "changed" } },
  ]) {
    assert.throws(() => assertMfgJournalReplay(existing, changed), {
      status: 409,
      data: { error_code: "IDEMPOTENCY_CONFLICT", request_id: "REQ" },
    });
  }
  assert.deepEqual(connectorJobSignal({ transaction_type: "mfg_journal", request_id: "REQ" }), {
    event: "mfg-journal:push",
    payload: { request_id: "REQ", action: "mfg_journal.push" },
  });
});

test("MFG PDF lookup has no party ledger requirement and validates exact voucher date", () => {
  assert.deepEqual(
    validateMfgPdfLookup({ company_id: "01", voucher_type: "MFG Journal", voucher_no: "1" }).errors,
    [],
  );
  assert.ok(
    validateMfgPdfLookup({
      company_id: "01",
      voucher_type: "Stock Journal",
      voucher_no: "1",
      voucher_date: "2026-02-30",
    }).errors.length,
  );
  assert.ok(validateMfgPdfLookup({ company_id: "01", voucher_no: "1" }).errors.length);
});

test("cached MFG PDF downloads offline only after ownership resolution", async () => {
  const pdf = { status: "ready", pdf: Buffer.from("%PDF-test") };
  const get = createMfgPdfByNumberRequester({
    resolve: async (client, reference, options) => {
      assert.equal(client, "CLIENT");
      assert.equal(reference.company_id, "01");
      assert.equal(options.requireLive, false);
      return target;
    },
    read: async () => pdf,
    available: async () => assert.fail("Cached PDF must not require Tally"),
    queue: async () => assert.fail("Must not re-export"),
  });
  assert.equal((await get("CLIENT", "01", "1", { voucherType: "Stock Journal" })).pdf, pdf);
  const forbidden = createMfgPdfByNumberRequester({
    resolve: async () => {
      throw new Error("not owned");
    },
    read: async () => assert.fail("Do not read foreign cache"),
  });
  await assert.rejects(forbidden("OTHER", "01", "1"), /not owned/);
});

test("uncached MFG PDF checks Tally and uses isolated type/date/client cache keys and event", async () => {
  const seen = [];
  const get = createMfgPdfByNumberRequester({
    resolve: async () => target,
    read: async () => null,
    available: async () => {},
    queue: async (client, id, lookup) => {
      seen.push({ client, id, lookup });
      return { status: "queued" };
    },
    emit: (client, event) => {
      assert.equal(event, "mfg-journal:pdf:export");
      return true;
    },
  });
  for (const [client, options] of [
    ["A", { voucherType: "Stock Journal" }],
    ["A", { voucherType: "MFG Journal" }],
    ["A", { voucherType: "Stock Journal", voucherDate: "2026-11-26" }],
    ["B", { voucherType: "Stock Journal" }],
  ])
    await get(client, "01", "1", options);
  assert.equal(new Set(seen.map((row) => row.id)).size, 4);
  assert.equal(seen[0].lookup.ledger_name, undefined);
  const offline = createMfgPdfByNumberRequester({
    resolve: async () => target,
    read: async () => null,
    available: async () => {
      throw new Error("offline");
    },
    queue: async () => assert.fail("No export while offline"),
  });
  await assert.rejects(offline("A", "01", "1"), /offline/);
});

test("PDF by request refuses missing, wrong-type and unfinished pushes; ready PDF works offline", async () => {
  for (const [record, error] of [
    [null, "not_found"],
    [{ transaction_type: "sales_voucher", status: "succeeded" }, "not_found"],
    [{ transaction_type: "mfg_journal", status: "failed" }, "not_succeeded"],
  ]) {
    const get = createMfgPdfRequester({
      readRequest: async () => record,
      readPdf: async () => assert.fail("Invalid request must not reach PDF cache"),
    });
    assert.equal((await get("A", "REQ")).error, error);
  }
  const pdf = { status: "ready", pdf: Buffer.from("%PDF-test") };
  const get = createMfgPdfRequester({
    readRequest: async () => ({ transaction_type: "mfg_journal", status: "succeeded" }),
    readPdf: async () => pdf,
    resolve: async () => assert.fail("cached PDF does not need live Tally"),
  });
  assert.equal((await get("A", "REQ")).pdf, pdf);
});

test("failed MFG PDF waits for explicit retry; retry emits an export, never another voucher push", async () => {
  let queued = 0;
  const get = createMfgPdfRequester({
    readRequest: async () => ({
      transaction_type: "mfg_journal",
      status: "succeeded",
      destination: target,
    }),
    readPdf: async () => ({ status: "failed" }),
    resolve: async () => target,
    available: async () => {},
    queue: async () => {
      queued++;
      return { status: "queued" };
    },
    emit: (_client, event) => {
      assert.equal(event, "mfg-journal:pdf:export");
      return true;
    },
  });
  assert.equal((await get("A", "REQ")).job.status, "failed");
  assert.equal(queued, 0);
  assert.equal((await get("A", "REQ", { retry: true })).job.status, "queued");
  assert.equal(queued, 1);
});
