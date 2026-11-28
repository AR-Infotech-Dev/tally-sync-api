import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { buildItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.utils.js";
import { buildItemSalesComparisonPdfData } from "../src/modules/item-sales-comparison/item-sales-comparison-pdf.service.js";
import { createItemSalesComparisonRequester } from "../src/modules/item-sales-comparison/item-sales-comparison.service.js";
import { validateItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.validator.js";
import { createReportHandlers } from "../src/shared/http/reportHandlers.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";

const input = { company_ids: ["02", "03"], match_by: "item_code", sales_basis: "gross" };
const item = (values = {}) => ({
  stock_item: "Product",
  item_code: "P1",
  unit: "Box",
  quantity_complete: true,
  sales_quantity: 3,
  sales_cents: 40000,
  return_quantity: 0,
  return_cents: 0,
  ...values,
});
function report(id, values = {}) {
  const year = id === "02" ? 2025 : 2026;
  return {
    company_id: id,
    company_guid: "private-" + id,
    company: "MH " + year,
    currency: "INR",
    source: "local_cache",
    verified: true,
    catalog_complete: true,
    from_date: year + "-04-01",
    to_date: year + 1 + "-03-31",
    synced_from_date: year + "-04-01",
    synced_to_date: year + 1 + "-03-31",
    period_source: "synced_snapshot",
    match_by: "item_code",
    sales_basis: "gross",
    comparison_type: "month-wise",
    monthly_data_version: 2,
    rows: [item()],
    monthly_data: [
      [year + "-04", 0, 1, 10000, 0, 0, "Box", true],
      [year + "-05", 0, 2, 30000, 0, 0, "Box", true],
    ],
    ...values,
  };
}
const reports = () => [
  report("02", {
    rows: [
      item({
        quantity_complete: false,
        sales_quantity: null,
        return_quantity: null,
        sales_cents: 30000,
      }),
    ],
    monthly_data: [
      ["2025-04", 0, 2, 20000, 0, 0, "Box", true],
      ["2025-05", 0, 0, 10000, 0, 0, null, false],
    ],
    quantity_issue_count: 1,
    quantity_issue_samples: [{ voucher_id: "30215", stock_item: "Product", quantity: "invalid" }],
  }),
  report("03"),
];

test("unavailable quantity keeps every item value and never appears as a zero or partial quantity", () => {
  const data = buildItemSalesComparison(reports(), input),
    row = data.rows[0];
  assert.equal(row.company_a.quantity, null);
  assert.equal(row.company_a.sales_quantity, null);
  assert.equal(row.company_a.unit, null);
  assert.equal(row.company_a.amount, 300);
  assert.equal(row.company_b.amount, 400);
  assert.equal(row.amount_difference, 100);
  assert.equal(row.quantity_comparable, false);
  assert.equal(row.quantity_difference, null);
  assert.equal(row.quantity_difference_percent, null);
  assert.equal(data.totals[0].amount, 300);
  assert.equal(data.totals[0].quantity_complete, false);
  assert.deepEqual(data.totals[0].quantities, []);
  assert.ok(data.warnings.some((message) => message.includes("All item values remain included")));
  assert.equal(data.companies[0].quantity_issue_samples[0].voucher_id, "30215");
});

test("version 2 month rows recover valid monthly quantities and flag only affected months", () => {
  const data = buildItemSalesComparison(reports(), { ...input, comparison_type: "month-wise" });
  assert.equal(data.months.length, 12);
  assert.equal(data.months[0].rows[0].company_a.quantity, 2);
  assert.equal(data.months[0].rows[0].quantity_difference, -1);
  assert.equal(data.months[0].rows[0].company_a.unit, "Box");
  assert.equal(data.months[1].rows[0].company_a.quantity, null);
  assert.equal(data.months[1].rows[0].company_a.amount, 100);
  assert.equal(data.months[1].total_amount_difference, 200);
  assert.equal(data.months[1].rows[0].quantity_difference, null);
  assert.equal(data.months[2].rows[0].company_a.quantity, 0);
  assert.equal(data.months[2].rows[0].quantity_difference, 0);
  assert.equal(data.months[0].companies[0].quantity_issue_count, undefined);
  assert.equal(
    data.months.reduce((sum, month) => sum + month.totals[0].amount, 0),
    data.totals[0].amount,
  );
});

test("different valid monthly units preserve values and do not invent a conversion or hide good items", () => {
  const values = reports();
  values[0].monthly_data[1] = ["2025-05", 0, 3, 10000, 0, 0, "Nos", true];
  for (const r of values) {
    r.rows.push(
      item({
        stock_item: "Good",
        item_code: "P2",
        unit: "Nos",
        sales_quantity: 1,
        sales_cents: 5000,
      }),
    );
    r.monthly_data.push([r.from_date.slice(0, 7), 1, 1, 5000, 0, 0, "Nos", true]);
  }
  const data = buildItemSalesComparison(values, { ...input, comparison_type: "month-wise" });
  const may = data.months[1].rows.find((row) => row.item_code === "P1");
  assert.equal(may.company_a.quantity, 3);
  assert.equal(may.company_a.unit, "Nos");
  assert.equal(may.quantity_comparable, false);
  assert.equal(may.amount_difference, 200);
  assert.equal(data.rows.find((row) => row.item_code === "P2").quantity_difference, 0);
  assert.equal(data.totals[0].amount, 350);
});

test("quantity flags and monthly payloads still reject malformed data and unreconciled amounts", () => {
  for (const change of [
    (r) => (r.rows[0].quantity_complete = "no"),
    (r) => (r.monthly_data[1][7] = "no"),
    (r) => (r.monthly_data[1][2] = 123),
    (r) => (r.monthly_data[1][3] = 999),
    (r) => (r.monthly_data[0][6] = null),
  ]) {
    const values = reports();
    change(values[0]);
    assert.throws(
      () => buildItemSalesComparison(values, { ...input, comparison_type: "month-wise" }),
      (error) => error.status === 502,
    );
  }
});

test("PDF uses an em dash for unknown quantities while keeping values and valid monthly figures", () => {
  const data = buildItemSalesComparisonPdfData(
    buildItemSalesComparison(reports(), { ...input, comparison_type: "month-wise" }),
  );
  assert.equal(data.rows[0].quantity_a, "—");
  assert.equal(data.rows[0].unit_a, null);
  assert.equal(data.rows[0].amount_a, "300");
  assert.equal(data.sections[0].rows[0].quantity_a, "2");
  assert.equal(data.sections[0].rows[0].unit_a, "Box");
  assert.equal(data.sections[1].rows[0].quantity_delta, "—");
  assert.equal(data.sections[1].rows[0].amount_a, "100");
});

test("JSON and PDF handlers succeed over HTTP for flagged voucher quantities instead of returning conflict", async (t) => {
  const request = createItemSalesComparisonRequester({
    resolveCompany: async (_client, lookup) => ({
      company_id: lookup.company_id,
      company_guid: "private-" + lookup.company_id,
    }),
    requestReport: async (_client, lookup) => ({
      requestId: lookup.company_id,
      request: {
        status: "succeeded",
        tally_result: { item_sales: reports().find((r) => r.company_id === lookup.company_id) },
      },
    }),
  });
  const handlers = createReportHandlers({
    label: "Item Sales Comparison",
    resultKey: "comparison",
    validate: validateItemSalesComparison,
    request,
    generatePdf: async (data) => {
      assert.equal(data.rows[0].company_a.quantity, null);
      return Buffer.from("%PDF-1.4 fixture");
    },
    filename: () => "comparison.pdf",
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.client = { client_id: "CLIENT_A" };
    next();
  });
  app.post("/comparison", handlers.json);
  app.post("/comparison/pdf", handlers.pdf);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (suffix) =>
    fetch(`http://127.0.0.1:${server.address().port}/comparison${suffix}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, comparison_type: "month-wise" }),
    });
  const json = await post("");
  assert.equal(json.status, 200);
  const data = (await json.json()).data;
  assert.equal(data.rows[0].company_a.quantity, null);
  assert.equal(data.rows[0].company_a.amount, 300);
  assert.equal(data.months.length, 12);
  const pdf = await post("/pdf");
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
  await pdf.arrayBuffer();
});
