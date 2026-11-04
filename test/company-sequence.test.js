import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureCompanySequence,
  formatCompanySequence,
} from "../src/modules/companies/company-sequence.model.js";

import { memoryCompanyRepository } from "./helpers/companyRepository.js";
import { ensureCompanyIndexes } from "../src/modules/companies/company.model.js";

test("Each client starts at 01; same-name GUIDs get stable distinct sequence IDs", async () => {
  const { rows, reserve } = memoryCompanyRepository();
  const a = {
    tally_guid: "guid-a",
    company_name: "Same name",
    company_number: "100001",
    data_path: "D:/Tally/Data",
  };
  const b = { tally_guid: "guid-b", company_name: "Same name" };
  assert.equal((await ensureCompanySequence(rows, "A", a, reserve)).company_id, "01");
  assert.equal((await ensureCompanySequence(rows, "A", b, reserve)).company_id, "02");
  assert.equal((await ensureCompanySequence(rows, "B", b, reserve)).company_id, "01");
  assert.equal(
    (await ensureCompanySequence(rows, "A", { ...a, company_name: "Renamed" }, reserve)).company_id,
    "01",
  );
  assert.equal(
    (await ensureCompanySequence(rows, "A", { tally_guid: "guid-c" }, reserve)).company_id,
    "03",
  );
});
test("Concurrent discovery cannot assign two IDs to the same company or duplicate an ID", async () => {
  const { rows, reserve, data } = memoryCompanyRepository();
  await Promise.all(
    Array.from({ length: 20 }, () =>
      ensureCompanySequence(rows, "A", { tally_guid: "same" }, reserve),
    ),
  );
  assert.equal(data.length, 1);
  const original = data[0].company_id;
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      ensureCompanySequence(rows, "A", { tally_guid: `new-${i}` }, reserve),
    ),
  );
  assert.equal(new Set(data.map((row) => row.company_id)).size, 21);
  assert.equal(data[0].company_id, original);
});
test("Existing GUID IDs migrate once and are never reset; formatting grows beyond 99", async () => {
  const { rows, reserve, data } = memoryCompanyRepository();
  data.push({ client_id: "A", tally_guid: "guid-a", company_id: "guid-a" });
  assert.equal(
    (await ensureCompanySequence(rows, "A", { tally_guid: "guid-a" }, reserve)).company_id,
    "01",
  );
  assert.equal(
    (await ensureCompanySequence(rows, "A", { tally_guid: "guid-a" }, reserve)).company_id,
    "01",
  );
  assert.equal(formatCompanySequence(9), "09");
  assert.equal(formatCompanySequence(10), "10");
  assert.equal(formatCompanySequence(100), "100");
  assert.throws(() => formatCompanySequence(0));
});

test("Legacy current RJ keeps 01, a newly seen same-GUID MH gets 02, and stronger locator metadata upgrades in place", async () => {
  const { rows, reserve, data } = memoryCompanyRepository();
  const rj = { tally_guid: "shared-guid", company_name: "RJ" };
  data.push({ ...rj, client_id: "A", company_id: "01" });
  const migrated = await ensureCompanySequence(rows, "A", rj, reserve);
  assert.equal(migrated.company_id, "01");
  assert.equal(migrated.company_sequence, 1);
  const mh = await ensureCompanySequence(rows, "A", { ...rj, company_name: "MH" }, reserve);
  assert.equal(mh.company_id, "02");
  assert.equal(data[0].company_name, "RJ");
  const upgraded = await ensureCompanySequence(
    rows,
    "A",
    { ...rj, company_number: "100002", data_path: "D:/Tally/Data" },
    reserve,
  );
  assert.equal(upgraded.company_id, "01");
  assert.equal(data.length, 2);
  assert.equal(upgraded.identity_basis, "locator");
  await assert.rejects(
    ensureCompanySequence(rows, "A", rj, reserve),
    /locator metadata is missing/,
  );
});

test("Index upgrade creates company-key uniqueness before dropping only the obsolete GUID uniqueness", async () => {
  const calls = [];
  const rows = {
    createIndex: async (key, options) => calls.push({ operation: "create", key, options }),
    listIndexes: () => ({
      toArray: async () => [
        { name: "_id_", key: { _id: 1 }, unique: true },
        { name: "client_id_1_tally_guid_1", key: { client_id: 1, tally_guid: 1 }, unique: true },
        { name: "custom_guid_lookup", key: { client_id: 1, tally_guid: 1 }, unique: false },
      ],
    }),
    dropIndex: async (name) => calls.push({ operation: "drop", name }),
  };
  await ensureCompanyIndexes(rows);
  assert.deepEqual(
    calls.map((row) => row.operation),
    ["create", "create", "drop"],
  );
  assert.deepEqual(calls[0].key, { client_id: 1, company_id: 1 });
  assert.equal(calls[1].options.unique, true);
  assert.deepEqual(calls[1].options.partialFilterExpression, { company_key: { $type: "string" } });
  assert.equal(calls[2].name, "client_id_1_tally_guid_1");
});
