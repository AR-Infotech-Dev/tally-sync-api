import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMfgJournalRequest } from "../src/modules/mfg_journal/mfg-journal.validator.js";
import { calculateMfgJournalOutputs } from "../src/modules/mfg_journal/mfg-journal.items.js";
import {
  normalizeMfgJournal,
  assertMfgJournalReplay,
} from "../src/modules/mfg_journal/mfg-journal.contract.js";

const journal = () => ({
  date: "2026-11-26",
  production: { stock_item: "Dell Laptop 15-inch", quantity: 10, unit: "Nos" },
  consumption: [{ stock_item: "Product A", quantity: 10, rate: 100, unit: "Nos" }],
  by_product: [
    {
      stock_item: "By Product Item",
      quantity: 1,
      unit: "Nos",
      type: "by_product",
      cost_allocation_percent: 10,
    },
  ],
  additional_costs: [{ ledger_name: "Purchase", amount: 100 }],
});
const errors = (value) =>
  validateMfgJournalRequest({ destination: { company_id: "01" }, mfg_journal: value });

test("three-part MFG contract computes 990 primary / 110 by-product from 1100 effective cost", () => {
  const value = journal();
  assert.deepEqual(errors(value), []);
  const result = calculateMfgJournalOutputs(value);
  assert.equal(result.totalCost, 1100);
  assert.equal(result.primary.amount, 990);
  assert.equal(result.primary.rate, 99);
  assert.equal(result.byProducts[0].amount, 110);
  assert.equal(result.byProducts[0].rate, 110);
  assert.equal(value.production.amount, undefined);
});

test("co-product, by-product and scrap share a separate output array and leave the primary remainder", () => {
  const value = journal();
  value.by_product = [
    {
      stock_item: "Co product",
      quantity: 2,
      unit: "Nos",
      type: "co_product",
      cost_allocation_percent: 10,
    },
    {
      stock_item: "By product",
      quantity: 1,
      unit: "Nos",
      type: "by_product",
      cost_allocation_percent: 5,
    },
    { stock_item: "Scrap", quantity: 1, unit: "Kg", type: "scrap", amount: 55 },
  ];
  assert.deepEqual(errors(value), []);
  assert.equal(calculateMfgJournalOutputs(value).primary.amount, 880);
});

test("invalid by-product shapes, types, percentages and conflicting valuations fail validation", () => {
  for (const invalid of [null, {}, "wrong"]) {
    const value = journal();
    value.by_product = invalid;
    if (invalid !== null) assert.ok(errors(value).length);
  }
  for (const fields of [
    { quantity: 0 },
    { unit: "" },
    { type: "sales" },
    { cost_allocation_percent: 101 },
    { cost_allocation_percent: -1 },
    { cost_allocation_percent: true },
    { cost_allocation_percent: "" },
    { amount: 999 },
    { rate: 999 },
  ]) {
    const value = journal();
    Object.assign(value.by_product[0], fields);
    assert.ok(errors(value).length, JSON.stringify(fields));
  }
  const excess = journal();
  excess.by_product.push({ ...excess.by_product[0], cost_allocation_percent: 95 });
  assert.ok(errors(excess).some((e) => e.field === "mfg_journal.by_product"));
  const wrongPrimary = journal();
  wrongPrimary.production.rate = 110;
  assert.ok(errors(wrongPrimary).some((e) => e.field === "mfg_journal.production.rate"));
  const multiple = journal();
  multiple.production = [multiple.production, { ...multiple.production }];
  assert.ok(errors(multiple).some((e) => e.field === "mfg_journal.production"));
});

test("primary-only manufacturing defaults to full cost; old single-item production arrays normalize identically", () => {
  const value = journal();
  value.by_product = [];
  assert.deepEqual(errors(value), []);
  assert.equal(calculateMfgJournalOutputs(value).primary.amount, 1100);
  const legacy = { ...value, production: [value.production] };
  assert.deepEqual(normalizeMfgJournal(value), normalizeMfgJournal(legacy));
  assert.doesNotThrow(() =>
    assertMfgJournalReplay(
      { transaction_type: "mfg_journal", destination: { company_id: "01" }, mfg_journal: legacy },
      { transaction_type: "mfg_journal", destination: { company_id: "01" }, mfg_journal: value },
    ),
  );
  const changed = structuredClone(value);
  changed.by_product = [{ stock_item: "Scrap", quantity: 1, unit: "Nos", rate: 10 }];
  assert.throws(
    () =>
      assertMfgJournalReplay(
        { transaction_type: "mfg_journal", mfg_journal: value },
        { transaction_type: "mfg_journal", mfg_journal: changed },
      ),
    { status: 409 },
  );
});

test("Server and Connector use the same manufacturing valuation contract", () => {
  const local = readFileSync(
    new URL("../src/modules/mfg_journal/mfg-journal.items.js", import.meta.url),
    "utf8",
  );
  const remote = readFileSync(
    new URL(
      "../../Connector/src/main/utils/tally-connector-engine/modules/vouchers/mfg-journal/mfg-journal.items.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(local, remote);
});
