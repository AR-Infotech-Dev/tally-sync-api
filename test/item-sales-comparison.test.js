import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { validateItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.validator.js";
import { buildItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.utils.js";
import { createItemSalesComparisonRequester } from "../src/modules/item-sales-comparison/item-sales-comparison.service.js";
import { createReportHandlers } from "../src/shared/http/reportHandlers.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { buildItemSalesComparisonPdfData } from "../src/modules/item-sales-comparison/item-sales-comparison-pdf.service.js";
import { getConnectorJobType } from "../src/modules/connector-jobs/connector-job.registry.js";
const input = {
  company_ids: ["02", "03"],
  from_date: "2026-04-01",
  to_date: "2026-10-31",
  match_by: "item_code",
  sales_basis: "gross",
};
const item = (values = {}) => ({
  stock_item: "Product",
  item_code: "P1",
  unit: "Nos",
  sales_quantity: 2,
  sales_cents: 20000,
  return_quantity: 0,
  return_cents: 0,
  ...values,
});
const report = (id, rows, values = {}) => ({
  company_id: id,
  company_guid: "private-" + id,
  company: id === "02" ? "MH" : "RJ",
  from_date: input.from_date,
  to_date: input.to_date,
  match_by: "item_code",
  sales_basis: "gross",
  verified: true,
  catalog_complete: true,
  currency: "INR",
  source: "local_cache",
  period_source: "synced_snapshot",
  synced_from_date: input.from_date,
  synced_to_date: input.to_date,
  rows,
  ...values,
});

test("comparison validates both company IDs, period, selectors and unsupported fields", () => {
  assert.deepEqual(validateItemSalesComparison(input), []);
  for (const body of [
    null,
    { ...input, company_ids: ["02"] },
    { ...input, company_ids: ["02", "02"] },
    { ...input, from_date: "2026-02-30" },
    { ...input, to_date: "2025-01-01" },
    { ...input, match_by: "auto" },
    { ...input, client_id: "foreign" },
  ])
    assert.ok(validateItemSalesComparison(body).length);
  assert.equal(getConnectorJobType("item_sales").requireTally, false);
  assert.deepEqual(validateItemSalesComparison({ ...input, item_code: " P1 " }), []);
  for (const code of ["", " ", null, 123, ["P1"], "a\nb", "x".repeat(501)])
    assert.ok(
      validateItemSalesComparison({ ...input, item_code: code }).some(
        (error) => error.field === "item_code",
      ),
    );
});

test("optional Item Code filters JSON rows and totals; missing, zero-sales and older Connector responses stay distinct", () => {
  const filtered = { ...input, item_code: " p1 " };
  const reports = [
    report("02", [item(), item({ stock_item: "Other", item_code: "P2", sales_cents: 999999 })], {
      item_code: "P1",
    }),
    report("03", [item({ sales_cents: 40000 })], { item_code: "p1" }),
  ];
  const data = buildItemSalesComparison(reports, filtered);
  assert.equal(data.rows.length, 1);
  assert.equal(data.item_code, "p1");
  assert.equal(data.totals[0].amount, 200);
  assert.equal(data.total_amount_difference, 200);
  const oneCompany = buildItemSalesComparison(
    [reports[0], report("03", [], { item_code: "P1" })],
    filtered,
  );
  assert.equal(oneCompany.rows[0].company_b.amount, 0);
  assert.equal(oneCompany.rows[0].match_status, "only_company_a");
  const zero = item({ unit: null, sales_quantity: 0, sales_cents: 0 });
  const zeroReport = buildItemSalesComparison(
    [report("02", [zero], { item_code: "P1" }), report("03", [zero], { item_code: "P1" })],
    filtered,
  );
  assert.equal(zeroReport.rows.length, 1);
  assert.equal(zeroReport.rows[0].quantity_difference, 0);
  assert.equal(zeroReport.rows[0].company_a.has_sales, false);
  assert.throws(
    () => buildItemSalesComparison([report("02", []), report("03", [])], filtered),
    /did not confirm/,
  );
  assert.throws(
    () =>
      buildItemSalesComparison(
        [report("02", [], { item_code: "P1" }), report("03", [], { item_code: "P1" })],
        filtered,
      ),
    (error) => error.status === 404,
  );
  assert.throws(
    () =>
      buildItemSalesComparison(
        [report("02", [], { catalog_complete: false }), report("03", [])],
        input,
      ),
    /Update Connector/,
  );
});

test("Item Code filter is forwarded for both companies with both matching modes", async () => {
  const codes = [];
  const request = createItemSalesComparisonRequester({
    resolveCompany: async (_client, lookup) => ({
      company_id: lookup.company_id,
      company_guid: "private-" + lookup.company_id,
    }),
    requestReport: async (_client, lookup) => {
      codes.push(lookup.item_code);
      assert.equal(lookup.match_by, "stock_item");
      return {
        requestId: lookup.company_id,
        request: {
          status: "succeeded",
          tally_result: {
            item_sales: report(lookup.company_id, [item()], {
              item_code: lookup.item_code,
              match_by: lookup.match_by,
            }),
          },
        },
      };
    },
  });
  const result = await request("CLIENT_A", { ...input, item_code: " P1 ", match_by: "stock_item" });
  assert.deepEqual(codes, ["P1", "P1"]);
  assert.equal(result.request.tally_result.comparison.rows.length, 1);
});

test("code comparison aligns renamed items, includes sales only on one side and calculates B minus A", () => {
  const result = buildItemSalesComparison(
    [
      report("02", [
        item(),
        item({ stock_item: "Only MH", item_code: "MH", sales_cents: 1000, sales_quantity: 1 }),
      ]),
      report("03", [
        item({ stock_item: "Renamed Product", sales_quantity: 3, sales_cents: 45000 }),
        item({ stock_item: "Only RJ", item_code: "RJ", sales_quantity: 4, sales_cents: 4000 }),
      ]),
    ],
    input,
  );
  const row = result.rows.find((row) => row.item_code === "P1");
  assert.equal(row.company_b.stock_item, "Renamed Product");
  assert.equal(row.quantity_difference, 1);
  assert.equal(row.amount_difference, 250);
  assert.equal(row.amount_difference_percent, 125);
  assert.equal(result.total_items, 3);
  assert.equal(result.total_amount_difference, 280);
  assert.equal(result.rows.find((row) => row.item_code === "RJ").quantity_difference_percent, null);
  assert.equal(result.rows.find((row) => row.item_code === "MH").match_status, "only_company_a");
});

test("split-company FY comparison defaults to each saved period and accepts explicit independent subperiods", async () => {
  const automatic = { company_ids: ["02", "03"], item_code: "P1" };
  assert.deepEqual(validateItemSalesComparison(automatic), []);
  const calls = [];
  const request = createItemSalesComparisonRequester({
    resolveCompany: async (_client, row) => ({
      company_id: row.company_id,
      company_guid: "private-" + row.company_id,
    }),
    requestReport: async (_client, lookup) => {
      calls.push(lookup);
      const from = lookup.from_date || (lookup.company_id === "02" ? "2025-04-01" : "2026-04-01");
      const to = lookup.to_date || (lookup.company_id === "02" ? "2026-03-31" : "2027-03-31");
      return {
        requestId: lookup.company_id,
        request: {
          status: "succeeded",
          tally_result: {
            item_sales: report(lookup.company_id, [item()], {
              item_code: "P1",
              from_date: from,
              to_date: to,
              synced_from_date: from,
              synced_to_date: to,
            }),
          },
        },
      };
    },
  });
  const result = (await request("CLIENT_A", automatic)).request.tally_result.comparison;
  assert.ok(calls.every((row) => row.from_date === undefined && row.to_date === undefined));
  assert.equal(result.companies[0].from_date, "2025-04-01");
  assert.equal(result.companies[1].from_date, "2026-04-01");
  assert.equal(result.from_date, null);
  assert.equal(result.period_mode, "synced_periods");
  const scoped = {
    ...automatic,
    company_periods: [
      { company_id: "03", from_date: "2026-04-01", to_date: "2026-10-31" },
      { company_id: "02", from_date: "2025-04-01", to_date: "2025-10-31" },
    ],
  };
  assert.deepEqual(validateItemSalesComparison(scoped), []);
  calls.length = 0;
  await request("CLIENT_A", scoped);
  assert.equal(calls[0].from_date, "2025-04-01");
  assert.equal(calls[1].from_date, "2026-04-01");
  for (const body of [
    { ...scoped, from_date: "2026-01-01" },
    { ...scoped, company_periods: [scoped.company_periods[0], scoped.company_periods[0]] },
    { ...scoped, company_ids: 3 },
    { ...automatic, from_date: "2025-01-01" },
  ])
    assert.ok(validateItemSalesComparison(body).length);
  assert.throws(
    () =>
      buildItemSalesComparison(
        [report("02", [item()], { source: "tally_live" }), report("03", [item()])],
        input,
      ),
    /unverified or inconsistent/,
  );
});

test("name comparison permits missing codes; incompatible units and currencies are never subtracted", () => {
  const options = { ...input, match_by: "stock_item" };
  const reports = [
    report("02", [item({ item_code: null })], { match_by: "stock_item" }),
    report("03", [item({ item_code: null, unit: "Box" })], {
      match_by: "stock_item",
      currency: "USD",
    }),
  ];
  const result = buildItemSalesComparison(reports, options);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].quantity_difference, null);
  assert.equal(result.rows[0].amount_difference, null);
  assert.equal(result.warnings.length, 2);
  assert.equal(
    buildItemSalesComparison([report("02", []), report("03", [item()], { currency: null })], input)
      .total_amount_difference,
    null,
  );
});

test("ambiguous item identities, invalid rows and unverified snapshots fail instead of inflating totals", () => {
  assert.throws(
    () => buildItemSalesComparison([report("02", [item(), item()]), report("03", [])], input),
    /multiple names or quantity units/,
  );
  assert.throws(
    () =>
      buildItemSalesComparison(
        [report("02", [item({ item_code: null })]), report("03", [])],
        input,
      ),
    /missing item identity/,
  );
  assert.throws(
    () =>
      buildItemSalesComparison([report("02", [], { verified: false }), report("03", [])], input),
    /unverified/,
  );
  assert.throws(
    () =>
      buildItemSalesComparison(
        [report("02", [item({ sales_cents: Infinity })]), report("03", [])],
        input,
      ),
    /supported range/,
  );
});

test("requester authorizes both companies before reads, preserves client scope and stops on a failed company", async () => {
  const calls = [];
  const resolveCompany = async (client, lookup) => {
    assert.equal(client, "CLIENT_A");
    calls.push("auth" + lookup.company_id);
    return { company_id: lookup.company_id, company_guid: "private-" + lookup.company_id };
  };
  const requestReport = async (client, lookup, type) => {
    assert.equal(client, "CLIENT_A");
    assert.equal(type, "item_sales");
    calls.push("read" + lookup.company_id);
    return {
      requestId: "job-" + lookup.company_id,
      request: {
        status: "succeeded",
        tally_result: { item_sales: report(lookup.company_id, [item()]) },
      },
    };
  };
  const request = createItemSalesComparisonRequester({ resolveCompany, requestReport });
  const result = await request("CLIENT_A", input);
  assert.deepEqual(calls, ["auth02", "auth03", "read02", "read03"]);
  assert.equal(result.request.tally_result.comparison.total_amount_difference, 0);
  const wrong = createItemSalesComparisonRequester({
    resolveCompany,
    requestReport: async () => ({
      request: { status: "succeeded", tally_result: { item_sales: report("foreign", []) } },
    }),
  });
  await assert.rejects(wrong("CLIENT_A", input), /unexpected company/);
  let reads = 0;
  const failure = createItemSalesComparisonRequester({
    resolveCompany,
    requestReport: async () => {
      reads++;
      return { request: { status: "failed", error: "Company closed" } };
    },
  });
  assert.equal((await failure("CLIENT_A", input)).request.status, "failed");
  assert.equal(reads, 1);
  const unauthorized = createItemSalesComparisonRequester({
    resolveCompany: async (_client, lookup) => {
      if (lookup.company_id === "03") throw Error("Not owned");
      return { company_id: "02" };
    },
    requestReport: async () => assert.fail("Must not read either company"),
  });
  await assert.rejects(unauthorized("CLIENT_A", input), /Not owned/);
});

test("real HTTP report handler returns comparison JSON and field validation errors with no partial result", async (t) => {
  const handlers = createReportHandlers({
    label: "Item Sales Comparison",
    resultKey: "comparison",
    validate: validateItemSalesComparison,
    request: async (client, body) => {
      assert.equal(client, "CLIENT_A");
      return {
        request: {
          status: "succeeded",
          tally_result: {
            comparison: buildItemSalesComparison(
              [
                report("02", [item()], { item_code: body.item_code || null }),
                report("03", [item()], { item_code: body.item_code || null }),
              ],
              body,
            ),
          },
        },
      };
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.client = { client_id: "CLIENT_A" };
    next();
  });
  app.post("/api/v1/item-sales-comparison", handlers.json);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/item-sales-comparison`;
  const post = (body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const response = await post(input);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.rows.length, 1);
  const filtered = await post({ ...input, item_code: "P1" });
  assert.equal(filtered.status, 200);
  const json = await filtered.json();
  assert.equal(json.data.item_code, "P1");
  assert.equal(json.data.rows[0].item_code, "P1");
  assert.equal(json.data.rows.length, 1);
  const invalid = await post({ ...input, company_ids: ["02", "02"] });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).success, false);
  const invalidCode = await post({ ...input, item_code: "" });
  assert.equal(invalidCode.status, 400);
  assert.equal((await invalidCode.json()).errors[0].field, "item_code");
});

test("PDF data retains separate quantities, company labels and unavailable difference markers", () => {
  const data = buildItemSalesComparisonPdfData(
    buildItemSalesComparison(
      [report("02", [item()]), report("03", [item({ unit: "Box" })], { currency: null })],
      input,
    ),
  );
  assert.equal(data.company_a, "MH");
  assert.equal(data.company_b, "RJ");
  assert.equal(data.rows[0].quantity_delta, "—");
  assert.equal(data.rows[0].amount_delta, "—");
});

test("PDF explains change with Increase/Decrease labels and positive magnitudes without changing JSON calculations", () => {
  const comparison = buildItemSalesComparison(
    [
      report("02", [item({ sales_quantity: 2, sales_cents: 6600000 })]),
      report("03", [item({ sales_quantity: 1, sales_cents: 3300000 })]),
    ],
    input,
  );
  const decrease = buildItemSalesComparisonPdfData(comparison);
  assert.equal(decrease.rows[0].quantity_delta, "Decrease 1");
  assert.equal(decrease.rows[0].amount_delta, "Decrease 33,000");
  assert.equal(decrease.total_delta, "Decrease 33,000");
  assert.equal(comparison.rows[0].amount_difference, -33000);
  const increase = buildItemSalesComparisonPdfData(
    buildItemSalesComparison(
      [
        report("02", [item({ sales_quantity: 1, sales_cents: 3300000 })]),
        report("03", [item({ sales_quantity: 2, sales_cents: 6600000 })]),
      ],
      input,
    ),
  );
  assert.equal(increase.rows[0].quantity_delta, "Increase 1");
  assert.equal(increase.rows[0].amount_delta, "Increase 33,000");
  const unchanged = buildItemSalesComparisonPdfData(
    buildItemSalesComparison([report("02", [item()]), report("03", [item()])], input),
  );
  assert.equal(unchanged.rows[0].amount_delta, "No change");
  assert.equal(unchanged.total_delta, "No change");
});
