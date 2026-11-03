import test from "node:test";
import assert from "node:assert/strict";
import { createCompanyRegistry } from "../src/modules/companies/company.service.js";
import { normalizeCompanies } from "../src/modules/companies/company.identity.js";
import { memoryCompanyRepository } from "./helpers/companyRepository.js";
import { ensureCompanySequence } from "../src/modules/companies/company-sequence.model.js";
import { validateVoucherLookup } from "../src/shared/utils/voucherLookup.validator.js";
import { availabilityError } from "../src/modules/connectors/connectorAvailability.service.js";

const a = "646d1f1a-2756-424a-bc49-b6a7b6138fb7";
const b = "646d1f1a-2756-424a-bc49-b6a7b6138fb8";
const company = (guid, name = "Same name") => ({ tally_guid: guid, company_name: name });
test("Voucher lookup requires company_id and preserves query aliases without a company-name fallback", () => {
  assert.deepEqual(
    validateVoucherLookup({ company_id: "01", party_ledger: "Party", voucher_number: "001" })
      .errors,
    [],
  );
  assert.ok(
    validateVoucherLookup({
      company: "Some other company",
      ledger_name: "Party",
      voucher_no: "001",
    }).errors.some((error) => error.field === "company_id"),
  );
});
function fixture() {
  const { rows: repository, reserve, data } = memoryCompanyRepository();
  let live = [company(a), company(b)];
  let failure;
  const options = {
    request: async () => {
      if (failure) throw Object.assign(new Error("Offline"), { code: failure });
      return { companies: live };
    },
    save: async (client, companies) => {
      for (const company of companies) {
        await ensureCompanySequence(repository, client, company, reserve);
        await repository.updateOne(
          { client_id: client, tally_guid: company.tally_guid },
          { $set: company },
        );
      }
    },
    read: async (client) => data.filter((row) => row.client_id === client),
  };
  return {
    options,
    registry: createCompanyRegistry(options),
    live: (rows) => {
      live = rows;
    },
    fail: (code) => {
      failure = code;
    },
  };
}
test("Company IDs survive rename, closed companies, and a new registry instance", async () => {
  const f = fixture();
  assert.deepEqual(
    (await f.registry.list("client1")).map((r) => r.company_id),
    ["01", "02"],
  );
  f.live([company(b, "Renamed")]);
  const rows = await createCompanyRegistry(f.options).list("client1");
  assert.equal(rows.find((r) => r.company_id === "01").status, "closed");
  assert.equal(rows.find((r) => r.company_id === "02").company_name, "Renamed");
  await assert.rejects(f.registry.resolve("client1", { company_id: "01" }), {
    code: "COMPANY_NOT_OPEN",
    httpStatus: 409,
  });
  assert.equal((await f.registry.resolve("client1", { company_id: "02" })).company_id, "02");
});
test("Same names have distinct IDs and fail closed when both are open", async () => {
  const f = fixture();
  assert.equal((await f.registry.list("client1")).length, 2);
  await assert.rejects(f.registry.resolve("client1", { company_id: "01" }), {
    code: "COMPANY_AMBIGUOUS",
  });
  f.live([company(a)]);
  assert.equal((await f.registry.resolve("client1", { company_id: "01" })).company_id, "01");
});
test("Client ownership and missing ID are validated without selecting an active default", async () => {
  const f = fixture();
  await f.registry.list("client1");
  f.live([]);
  await assert.rejects(f.registry.resolve("client2", { company_id: "01" }), {
    code: "COMPANY_NOT_FOUND",
    httpStatus: 404,
  });
  await assert.rejects(f.registry.resolve("client1", {}), {
    code: "COMPANY_ID_REQUIRED",
    httpStatus: 400,
  });
});
test("Disconnected list retains known companies with unknown status; execution is blocked", async () => {
  const f = fixture();
  await f.registry.list("client1");
  f.fail("CONNECTOR_NOT_CONNECTED");
  assert.ok((await f.registry.list("client1")).every((row) => row.status === "unknown"));
  await assert.rejects(f.registry.resolve("client1", { company_id: "01" }), {
    code: "CONNECTOR_NOT_CONNECTED",
    httpStatus: 503,
  });
});

test("Standard availability errors do not block the persisted company list but still block business execution", async () => {
  const f = fixture();
  await f.registry.list("client1");
  for (const code of [
    "CONNECTOR_NOT_CONNECTED",
    "CONNECTOR_NOT_RESPONDING",
    "CONNECTOR_CHECK_TIMEOUT",
    "TALLY_NOT_CONNECTED",
    "TALLY_TIMEOUT",
  ]) {
    const failure = availabilityError(code);
    const registry = createCompanyRegistry({
      ...f.options,
      request: async () => {
        throw failure;
      },
    });
    const rows = await registry.list("client1");
    assert.deepEqual(
      rows.map((row) => row.company_id),
      ["01", "02"],
    );
    assert.ok(rows.every((row) => row.status === "unknown"));
    await assert.rejects(
      registry.resolve("client1", { company_id: "01" }),
      (error) => error === failure,
    );
  }
});

test("First-time offline company discovery returns an empty list without inventing IDs", async () => {
  const registry = createCompanyRegistry({
    request: async () => {
      throw availabilityError("CONNECTOR_NOT_CONNECTED");
    },
    read: async () => [],
    save: async () => {
      throw new Error("Must not write offline");
    },
  });
  assert.deepEqual(await registry.list("new-client"), []);
});
test("Public IDs are sequences, never GUID or former hashes", async () => {
  const f = fixture();
  f.live([company(a)]);
  const target = await f.registry.resolve("client1", { company_id: "01" });
  assert.equal(target.company_id, "01");
  assert.equal(target.company_guid, a);
  for (const id of [a, "COMP_NAME_BASED"])
    await assert.rejects(f.registry.resolve("client1", { company_id: id }), {
      code: "COMPANY_NOT_FOUND",
    });
  assert.throws(() => normalizeCompanies("client1", [company("")]), {
    code: "COMPANY_DISCOVERY_INVALID",
  });
  assert.throws(() => normalizeCompanies("client1", [company(a), company(a)]), {
    code: "COMPANY_DISCOVERY_INVALID",
  });
});
