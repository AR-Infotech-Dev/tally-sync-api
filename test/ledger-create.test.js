import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { validateLedgerCreate } from "../src/modules/ledgers/ledger-create.validator.js";
import {
  normalizeLedgerCreate,
  assertLedgerCreateReplay,
} from "../src/modules/ledgers/ledger-create.utils.js";
import { createMasterHandlers } from "../src/shared/http/masterHandlers.js";
import { claimLedgerImport } from "../src/modules/connector-jobs/connector-job.model.js";
import {
  connectorJobSignal,
  getConnectorJobType,
} from "../src/modules/connector-jobs/connector-job.registry.js";
import { SOCKET_EVENTS } from "../src/socket/utils/events.js";

const payload = () => ({
  idempotency_key: "ledger-test-1",
  destination: { company_id: "02" },
  ledger: { name: "ABC Traders", parent: "Sundry Debtors", dealer_code: "AH0003", bill_wise: true },
});

test("ledger create validates supported fields without silently accepting financial data", () => {
  assert.deepEqual(validateLedgerCreate(payload()), []);
  for (const [field, value] of [
    ["name", ""],
    ["name", "Bad\u0001Name"],
    ["parent", ""],
    ["bill_wise", "yes"],
    ["dealer_code", 4],
    ["opening_balance", 100],
  ]) {
    const body = payload();
    body.ledger[field] = value;
    assert.ok(validateLedgerCreate(body).some((error) => error.field === `ledger.${field}`));
  }
  const body = payload();
  body.destination.company_name = "Injected company";
  assert.ok(validateLedgerCreate(body).some((error) => error.field === "destination.company_name"));
  delete body.idempotency_key;
  assert.ok(validateLedgerCreate(body).some((error) => error.field === "idempotency_key"));
  assert.ok(validateLedgerCreate(null).length);
});

test("idempotency preserves a ledger request and rejects changed company, fields or transaction type", () => {
  const input = {
    ...payload(),
    client_id: "A",
    transaction_type: "ledger_create",
    ledger: normalizeLedgerCreate(payload().ledger),
  };
  const existing = { ...structuredClone(input), request_id: "R1" };
  assert.doesNotThrow(() => assertLedgerCreateReplay(existing, input));
  for (const changed of [
    { ...input, destination: { company_id: "03" } },
    { ...input, ledger: { ...input.ledger, parent: "Sundry Creditors" } },
  ])
    assert.throws(() => assertLedgerCreateReplay(existing, changed), {
      status: 409,
      apiCode: 2012,
    });
  assert.throws(
    () => assertLedgerCreateReplay({ ...existing, transaction_type: "sales_order" }, input),
    { status: 409 },
  );
  assert.throws(
    () => assertLedgerCreateReplay(existing, { ...input, transaction_type: "sales_order" }),
    { status: 409 },
  );
});

test("only one Server import claim can be granted and the claim is client-scoped", async () => {
  const row = {
    client_id: "A",
    request_id: "R1",
    transaction_type: "ledger_create",
    status: "fetching",
  };
  const collection = {
    async updateOne(filter, update) {
      if (
        filter.client_id !== row.client_id ||
        filter.request_id !== row.request_id ||
        row.ledger_import_attempted_at ||
        ["failed", "succeeded"].includes(row.status)
      )
        return { modifiedCount: 0 };
      assert.equal(filter.ledger_import_attempted_at.$exists, false);
      Object.assign(row, update.$set);
      return { modifiedCount: 1 };
    },
    async findOne(filter) {
      return filter.client_id === row.client_id && filter.request_id === row.request_id
        ? { ...row }
        : null;
    },
  };
  const results = await Promise.all([
    claimLedgerImport(collection, "A", "R1"),
    claimLedgerImport(collection, "A", "R1"),
  ]);
  assert.equal(results.filter((result) => result.claimed).length, 1);
  assert.ok(results.every((result) => result.import_attempted));
  assert.equal(await claimLedgerImport(collection, "B", "R1"), null);
});

test("ledger jobs use their own Connector event and require live Tally", () => {
  assert.deepEqual(connectorJobSignal({ request_id: "R1", transaction_type: "ledger_create" }), {
    event: SOCKET_EVENTS.ledgerCreate,
    payload: { request_id: "R1", action: "ledger.create" },
  });
  assert.equal(getConnectorJobType("ledger_create").requireTally, true);
});

test("the create/status HTTP handlers preserve client scope, duplicate results, validation, timeout and failure details", async (t) => {
  const body = payload();
  const record = {
    request_id: "R1",
    client_id: "CLIENT_A",
    transaction_type: "ledger_create",
    status: "succeeded",
    ledger: body.ledger,
    tally_result: {
      ledger: { ...body.ledger, master_id: "123", guid: "native-ledger-guid" },
      verified: true,
      cache_update: { status: "queued" },
    },
  };
  let completion = { request: record };
  let queued;
  const handlers = createMasterHandlers({
    label: "Ledger",
    validate: validateLedgerCreate,
    queue: async (input) => {
      queued = input;
      return { request: record, duplicate: true };
    },
    wait: async (clientId, requestId) => {
      assert.equal(clientId, "CLIENT_A");
      assert.equal(requestId, "R1");
      return completion;
    },
    read: async (clientId, requestId) =>
      clientId === record.client_id && requestId === record.request_id ? record : null,
  });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.get("x-api-key") !== "fixture-key") return res.status(401).json({ success: false });
    req.client = { client_id: req.get("x-client-id") };
    next();
  });
  app.post("/api/v1/ledgers/create", handlers.create);
  app.get("/api/v1/ledgers/create/:requestId/status", handlers.getRequest);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/v1/ledgers/create`;
  const headers = {
    "Content-Type": "application/json",
    "X-Client-ID": "CLIENT_A",
    "X-API-Key": "fixture-key",
  };
  const post = (input = body) =>
    fetch(url, { method: "POST", headers, body: JSON.stringify(input) });
  const success = await post();
  assert.equal(success.status, 200);
  const result = await success.json();
  assert.equal(result.duplicate, true);
  assert.equal(result.ledger.master_id, "123");
  assert.equal(queued.client_id, "CLIENT_A");
  assert.equal(result.voucher_number, undefined);
  assert.equal((await fetch(`${url}/R1/status`, { headers })).status, 200);
  assert.equal(
    (await fetch(`${url}/R1/status`, { headers: { ...headers, "X-Client-ID": "CLIENT_B" } }))
      .status,
    404,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).status,
    401,
  );
  assert.equal(
    (await post({ ...body, ledger: { ...body.ledger, opening_balance: 100 } })).status,
    400,
  );
  completion = { request: { ...record, status: "processing" }, timedOut: true };
  const timeout = await post();
  assert.equal(timeout.status, 504);
  assert.equal((await timeout.json()).request_id, "R1");
  completion = {
    request: {
      ...record,
      status: "failed",
      error: "Creation not confirmed",
      tally_result: {
        error_code: "LEDGER_CREATE_OUTCOME_UNKNOWN",
        lookup_status: 409,
        outcome_unknown: true,
      },
    },
  };
  const failed = await post();
  assert.equal(failed.status, 409);
  assert.equal((await failed.json()).error_code, "LEDGER_CREATE_OUTCOME_UNKNOWN");
  completion = { request: { ...record, tally_result: { verified: false } } };
  const unverified = await post();
  assert.equal(unverified.status, 502);
  assert.equal((await unverified.json()).error_code, "LEDGER_CREATE_UNVERIFIED");
});
