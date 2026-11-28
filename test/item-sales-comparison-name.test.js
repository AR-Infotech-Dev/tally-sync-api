import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { validateItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.validator.js";
import { buildItemSalesComparison } from "../src/modules/item-sales-comparison/item-sales-comparison.utils.js";
import { buildItemSalesComparisonPdfData } from "../src/modules/item-sales-comparison/item-sales-comparison-pdf.service.js";
import { createItemSalesComparisonRequester } from "../src/modules/item-sales-comparison/item-sales-comparison.service.js";
import { createReportHandlers } from "../src/shared/http/reportHandlers.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";

const input = { company_ids: ["02", "03"], stock_item: " Product " };
const item = (name = "Product", values = {}) => ({
  stock_item: name,
  item_code: null,
  unit: "Nos",
  sales_quantity: 2,
  sales_cents: 20000,
  return_quantity: 0,
  return_cents: 0,
  ...values,
});
function report(id, rows = [item()], values = {}) {
  const year = id === "02" ? 2025 : 2026;
  return {
    company_id: id,
    company_guid: "private-" + id,
    company: "MH " + year,
    currency: "INR",
    from_date: year + "-04-01",
    to_date: year + 1 + "-03-31",
    synced_from_date: year + "-04-01",
    synced_to_date: year + 1 + "-03-31",
    source: "local_cache",
    verified: true,
    catalog_complete: true,
    period_source: "synced_snapshot",
    match_by: "stock_item",
    sales_basis: "gross",
    stock_item: "Product",
    rows,
    ...values,
  };
}

test("name selector validates its field and disallows combining code and name", () => {
  assert.deepEqual(validateItemSalesComparison(input), []);
  for (const name of ["", " ", null, 123, [], "a\nb", "x".repeat(501)])
    assert.ok(
      validateItemSalesComparison({ ...input, stock_item: name }).some(
        (error) => error.field === "stock_item",
      ),
    );
  const errors = validateItemSalesComparison({ ...input, item_code: "P1" });
  for (const field of ["item_code", "stock_item"])
    assert.ok(errors.some((error) => error.field === field));
});

test("name filter narrows rows and totals without requiring codes; missing and zero items stay distinct", () => {
  const a = report("02", [item(), item("Other", { sales_cents: 999999 })]);
  const b = report("03", [item("PRODUCT", { sales_cents: 30000 })]);
  const data = buildItemSalesComparison([a, b], input);
  assert.equal(data.stock_item, "Product");
  assert.equal(data.match_by, "stock_item");
  assert.equal(data.rows.length, 1);
  assert.equal(data.totals[0].amount, 200);
  assert.equal(data.total_amount_difference, 100);
  const one = buildItemSalesComparison([a, report("03", [])], input);
  assert.equal(one.rows[0].company_b.amount, 0);
  assert.equal(one.rows[0].match_status, "only_company_a");
  const zero = item("Product", { sales_quantity: 0, sales_cents: 0, unit: null });
  assert.equal(
    buildItemSalesComparison([report("02", [zero]), report("03", [zero])], input).rows[0].company_a
      .has_sales,
    false,
  );
  assert.throws(
    () => buildItemSalesComparison([report("02", []), report("03", [])], input),
    (error) => error.status === 404,
  );
  assert.throws(
    () => buildItemSalesComparison([a, report("03", [], { stock_item: undefined })], input),
    /did not confirm/,
  );
  assert.throws(
    () => buildItemSalesComparison([report("02", [item(), item("PRODUCT")]), b], input),
    (error) => error.status === 409,
  );
});

test("monthly name comparisons retain original compact row indexes while excluding unrelated items", () => {
  const reports = ["02", "03"].map((id) => {
    const year = id === "02" ? 2025 : 2026;
    return report(id, [item("Other", { sales_cents: 99900 }), item()], {
      comparison_type: "month-wise",
      monthly_data_version: 1,
      monthly_data: [
        [year + "-04", 0, 2, 99900, 0, 0],
        [year + "-04", 1, 2, 20000, 0, 0],
      ],
    });
  });
  const result = buildItemSalesComparison(reports, { ...input, comparison_type: "month-wise" });
  assert.equal(result.months.length, 12);
  assert.equal(result.months[0].stock_item, "Product");
  assert.equal(result.months[0].rows.length, 1);
  assert.equal(result.months[0].totals[0].amount, 200);
  assert.equal(result.months[1].rows[0].company_a.amount, 0);
});

test("PDF displays the requested name, escapes it and keeps code/all-items labels", async () => {
  const template = Handlebars.compile(
    await readFile(new URL("../src/templates/item-sales-comparison.hbs", import.meta.url), "utf8"),
  );
  const name = "<Product & Special>";
  const data = buildItemSalesComparison(
    [
      report("02", [item(name)], { stock_item: name }),
      report("03", [item(name)], { stock_item: name }),
    ],
    { ...input, stock_item: name },
  );
  const html = template(buildItemSalesComparisonPdfData(data)).replace(/\s+/g, " ");
  assert.ok(html.includes("Stock Item Name: &lt;Product &amp; Special&gt;"));
  assert.ok(!html.includes("All stock items"));
  assert.ok(
    template(
      buildItemSalesComparisonPdfData({ ...data, stock_item: null, item_code: "P1" }),
    ).includes("Item Code: P1"),
  );
  assert.ok(
    template(buildItemSalesComparisonPdfData({ ...data, stock_item: null })).includes(
      "All stock items",
    ),
  );
});

test("HTTP JSON/PDF requests forward the name for each authorized company and keep validation errors", async (t) => {
  const calls = [];
  const request = createItemSalesComparisonRequester({
    resolveCompany: async (client, lookup, options) => {
      assert.equal(client, "CLIENT_A");
      assert.equal(options.requireLive, false);
      return { company_id: lookup.company_id, company_guid: "private-" + lookup.company_id };
    },
    requestReport: async (client, lookup, kind) => {
      assert.equal(client, "CLIENT_A");
      assert.equal(kind, "item_sales");
      calls.push(lookup);
      return {
        requestId: lookup.company_id,
        request: { status: "succeeded", tally_result: { item_sales: report(lookup.company_id) } },
      };
    },
  });
  const handlers = createReportHandlers({
    label: "Item Sales Comparison",
    resultKey: "comparison",
    validate: validateItemSalesComparison,
    request,
    generatePdf: async (data) => {
      assert.equal(data.stock_item, "Product");
      assert.equal(data.rows.length, 1);
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
  const post = (body, path = "") =>
    fetch(`http://127.0.0.1:${server.address().port}/comparison${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const json = await post(input);
  assert.equal(json.status, 200);
  assert.equal((await json.json()).data.stock_item, "Product");
  const pdf = await post(input, "/pdf");
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  await pdf.arrayBuffer();
  assert.equal(calls.length, 4);
  assert.ok(
    calls.every(
      (lookup) =>
        lookup.stock_item === "Product" &&
        lookup.match_by === "stock_item" &&
        lookup.comparison_type === "year-wise",
    ),
  );
  const invalid = await post({ ...input, item_code: "P1" });
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 4);
});
