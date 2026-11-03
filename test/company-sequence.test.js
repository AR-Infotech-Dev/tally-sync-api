import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureCompanySequence,
  formatCompanySequence,
} from "../src/modules/companies/company-sequence.model.js";

import { memoryCompanyRepository } from "./helpers/companyRepository.js";

test("Each client starts at 01; same-name GUIDs get stable distinct sequence IDs", async () => {
  const { rows, reserve } = memoryCompanyRepository();
  const a = { tally_guid: "guid-a", company_name: "Same name" };
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
