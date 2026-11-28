import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { validateItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.validator.js";
import { buildItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.utils.js";
import { buildItemSalesComparisonPdfData } from "../src/modules/item-sales-comparison/item-sales-comparison-pdf.service.js";
import { createItemSalesComparisonRequester } from "../src/modules/item-sales-comparison/item-sales-comparison.service.js";
import { createReportHandlers } from "../src/shared/http/reportHandlers.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";

const input = {
  company_ids: ["02", "03"],
  comparison_type: "month-wise",
  match_by: "item_code",
  sales_basis: "gross",
  item_code: "P1",
};
function report(id, year, values = [], options = {}) {
  const from = options.from_date || `${year}-04-01`,
    to = options.to_date || `${year + 1}-03-31`;
  return {
    company_id: id,
    company_guid: "private-" + id,
    company: "MH " + year,
    currency: "INR",
    source: "local_cache",
    verified: true,
    catalog_complete: true,
    from_date: from,
    to_date: to,
    synced_from_date: from,
    synced_to_date: to,
    period_source: "synced_snapshot",
    comparison_type: "month-wise",
    monthly_data_version: 1,
    match_by: "item_code",
    sales_basis: "gross",
    item_code: "P1",
    rows: [
      {
        stock_item: "Product",
        item_code: "P1",
        unit: "Nos",
        sales_quantity: values.reduce((sum, row) => sum + row[1], 0),
        sales_cents: values.reduce((sum, row) => sum + row[2], 0),
        return_quantity: 0,
        return_cents: 0,
      },
    ],
    monthly_data: values.map(([month, qty, cents]) => [month, 0, qty, cents, 0, 0]),
    ...options,
  };
}
const reports = () => [
  report("02", 2025, [
    ["2025-04", 2, 6600000],
    ["2025-06", 5, 1000],
    ["2026-01", 1, 100],
  ]),
  report("03", 2026, [
    ["2026-04", 1, 3300000],
    ["2026-06", 2, 500],
    ["2027-01", 2, 200],
  ]),
];

test("comparison type validates its two values and defaults to the existing year summary", () => {
  const { comparison_type, ...defaults } = input;
  assert.deepEqual(validateItemSalesComparison(defaults), []);
  assert.deepEqual(validateItemSalesComparison(input), []);
  assert.deepEqual(validateItemSalesComparison({ ...input, comparison_type: "year-wise" }), []);
  for (const value of ["monthly", "yearly", "", null, 1])
    assert.ok(
      validateItemSalesComparison({ ...input, comparison_type: value }).some(
        (error) => error.field === "comparison_type",
      ),
    );
  const result = buildItemSalesComparison(reports(), defaults);
  assert.equal(result.comparison_type, "year-wise");
  assert.equal(result.months, undefined);
  assert.equal(result.rows[0].company_a.quantity, 8);
});

test("monthly comparison aligns April through March across split FYs and preserves annual totals", () => {
  const result = buildItemSalesComparison(reports(), input);
  assert.equal(result.months.length, 12);
  assert.equal(result.months[0].month_name, "April");
  assert.equal(result.months[11].month_name, "March");
  const april = result.months[0];
  assert.equal(april.companies[0].from_date, "2025-04-01");
  assert.equal(april.companies[1].from_date, "2026-04-01");
  assert.equal(april.rows[0].quantity_difference, -1);
  assert.equal(april.rows[0].amount_difference, -33000);
  assert.equal(result.months[1].rows[0].company_a.amount, 0);
  assert.equal(result.months[1].rows[0].amount_difference, 0);
  assert.equal(result.months[9].companies[0].from_date, "2026-01-01");
  assert.equal(result.months[9].companies[1].from_date, "2027-01-01");
  for (let index = 0; index < 2; index++)
    assert.equal(
      result.months.reduce((sum, month) => sum + month.totals[index].amount, 0),
      result.totals[index].amount,
    );
});

test("uncovered months are unavailable instead of zero and later starts never shift April to July", () => {
  const rows = [
    reports()[0],
    report("03", 2026, [["2026-07", 3, 300]], { from_date: "2026-07-15" }),
  ];
  const result = buildItemSalesComparison(rows, input);
  assert.equal(result.months[0].comparison_available, false);
  assert.equal(result.months[0].rows.length, 0);
  assert.equal(result.months[0].companies[1].covered, false);
  assert.equal(result.months[0].total_amount_difference, null);
  const july = result.months.find((month) => month.month_name === "July");
  assert.equal(july.companies[0].from_date, "2025-07-01");
  assert.equal(july.companies[1].from_date, "2026-07-15");
  assert.equal(july.rows[0].company_a.amount, 0);
  assert.equal(july.rows[0].company_b.amount, 3);
  assert.equal(july.partial_month, true);
  assert.equal(result.warnings.length, 2);
});

test("monthly payloads reject missing capability, duplicate/out-of-range rows and totals that disagree", () => {
  const original = reports();
  for (const changed of [
    { ...original[0], monthly_data_version: undefined },
    { ...original[0], monthly_data: [...original[0].monthly_data, original[0].monthly_data[0]] },
    { ...original[0], monthly_data: [["2025-04", 999, 2, 6600000, 0, 0]] },
    { ...original[0], monthly_data: [["2030-04", 0, 2, 6600000, 0, 0]] },
    { ...original[0], monthly_data: [] },
  ])
    assert.throws(
      () => buildItemSalesComparison([changed, original[1]], input),
      (error) => error.status === 502,
    );
});

test("monthly zero-stock rows, currency checks and explicit company subperiods retain existing behavior", () => {
  const zero = {
    stock_item: "Unsold",
    item_code: "ZERO",
    unit: null,
    sales_quantity: 0,
    sales_cents: 0,
    return_quantity: 0,
    return_cents: 0,
  };
  const selected = reports().map((row) => ({ ...row, item_code: null, rows: [...row.rows, zero] }));
  const all = buildItemSalesComparison(selected, { ...input, item_code: undefined });
  assert.equal(all.months[0].rows.length, 2);
  assert.equal(
    all.months[0].rows.find((row) => row.item_code === "ZERO").company_a.has_sales,
    false,
  );
  const mismatched = reports();
  mismatched[1].currency = "USD";
  assert.equal(
    buildItemSalesComparison(mismatched, input).months[0].rows[0].amount_difference,
    null,
  );
  const periods = {
    ...input,
    company_periods: [
      { company_id: "02", from_date: "2025-04-01", to_date: "2025-04-30" },
      { company_id: "03", from_date: "2026-04-01", to_date: "2026-04-30" },
    ],
  };
  const single = [
    report("02", 2025, [["2025-04", 2, 20000]], { to_date: "2025-04-30" }),
    report("03", 2026, [["2026-04", 1, 10000]], { to_date: "2026-04-30" }),
  ];
  assert.equal(buildItemSalesComparison(single, periods).months.length, 1);
});

test("monthly PDF sections retain positive Increase/Decrease presentation", () => {
  const pdf = buildItemSalesComparisonPdfData(buildItemSalesComparison(reports(), input));
  assert.equal(pdf.sections.length, 12);
  assert.equal(pdf.comparison_type_label, "Month-wise");
  assert.equal(pdf.sections[0].title, "April");
  assert.equal(pdf.sections[0].rows[0].amount_delta, "Decrease 33,000");
  assert.equal(pdf.sections[1].rows[0].amount_delta, "No change");
});

test("HTTP comparison forwards type to cached jobs and serializes monthly rows with year-wise default", async (t) => {
  const calls = [];
  const requester = createItemSalesComparisonRequester({
    resolveCompany: async (client, lookup, options) => {
      assert.equal(client, "CLIENT_A");
      assert.equal(options.requireLive, false);
      return { company_id: lookup.company_id, company_guid: "private-" + lookup.company_id };
    },
    requestReport: async (client, lookup) => {
      assert.equal(client, "CLIENT_A");
      calls.push(lookup.comparison_type);
      return {
        requestId: lookup.company_id,
        request: {
          status: "succeeded",
          tally_result: {
            item_sales: reports().find((row) => row.company_id === lookup.company_id),
          },
        },
      };
    },
  });
  const handlers = createReportHandlers({
    label: "Item Sales Comparison",
    resultKey: "comparison",
    validate: validateItemSalesComparison,
    request: requester,
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.client = { client_id: "CLIENT_A" };
    next();
  });
  app.post("/comparison", handlers.json);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (body) =>
    fetch(`http://127.0.0.1:${server.address().port}/comparison`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const monthly = await post(input);
  assert.equal(monthly.status, 200);
  assert.equal((await monthly.json()).data.months.length, 12);
  assert.deepEqual(calls, ["month-wise", "month-wise"]);
  const { comparison_type, ...defaults } = input;
  const yearly = await post(defaults);
  assert.equal((await yearly.json()).data.comparison_type, "year-wise");
  const invalid = await post({ ...input, comparison_type: "monthly" });
  assert.equal(invalid.status, 400);
});
