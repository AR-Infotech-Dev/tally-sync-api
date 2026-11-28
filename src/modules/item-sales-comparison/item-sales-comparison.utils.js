import { comparisonPeriods } from "./item-sales-comparison.periods.js";
import { isIsoDate } from "../../shared/utils/dateValidation.js";
import { buildMonthComparisons } from "./item-sales-comparison.months.js";

const key = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
const roundQuantity = (value) => {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
    throw comparisonError("Item sales quantity exceeds the supported range.", 502);
  return Math.round(value * 1e9) / 1e9;
};
const percent = (difference, base) =>
  base === 0 ? null : Math.round((difference / Math.abs(base)) * 10000) / 100;
export const comparisonError = (message, status = 409) =>
  Object.assign(new Error(message), { status, apiCode: 2012 });
const safeCents = (value) => {
  if (!Number.isSafeInteger(value))
    throw comparisonError("Item sales amount exceeds the supported range.", 502);
  return value;
};

function buildSummaryComparison(reports, input) {
  const matchBy = input.match_by || "item_code";
  const basis = input.sales_basis || "gross";
  const selectedCode = key(input.item_code);
  const periods = comparisonPeriods(input);
  reports = reports.map((report) => {
    if (key(report.item_code) !== selectedCode)
      throw comparisonError(
        "Connector did not confirm the requested Item Code filter. Update Connector and retry.",
        502,
      );
    return {
      ...report,
      rows:
        selectedCode && Array.isArray(report.rows)
          ? report.rows.filter((row) => key(row.item_code) === selectedCode)
          : report.rows,
    };
  });
  const valueComparable = Boolean(
    reports[0].currency &&
    reports[1].currency &&
    key(reports[0].currency) === key(reports[1].currency),
  );
  const maps = reports.map((report, index) => {
    const expected = periods[index];
    if (
      !report.verified ||
      report.source !== "local_cache" ||
      (!selectedCode && report.catalog_complete !== true) ||
      !Array.isArray(report.rows) ||
      !isIsoDate(report.synced_from_date, { bounded: true }) ||
      !isIsoDate(report.synced_to_date, { bounded: true }) ||
      report.from_date < report.synced_from_date ||
      report.to_date > report.synced_to_date ||
      !isIsoDate(report.from_date, { bounded: true }) ||
      !isIsoDate(report.to_date, { bounded: true }) ||
      report.from_date > report.to_date ||
      (expected.from_date !== undefined
        ? report.from_date !== expected.from_date || report.to_date !== expected.to_date
        : report.period_source !== "synced_snapshot" ||
          report.from_date !== report.synced_from_date ||
          report.to_date !== report.synced_to_date) ||
      report.match_by !== matchBy ||
      report.sales_basis !== basis
    )
      throw comparisonError(
        "Connector returned an unverified or inconsistent item sales report. Update Connector and retry.",
        502,
      );
    const rows = new Map();
    for (const row of report.rows) {
      const identity = key(row[matchBy]);
      if (
        !identity ||
        !row.stock_item ||
        (!row.unit && (row.sales_quantity !== 0 || row.return_quantity !== 0)) ||
        ![row.sales_quantity, row.return_quantity].every(Number.isFinite)
      )
        throw comparisonError(
          "Item sales contains a missing item identity or invalid quantity.",
          502,
        );
      if (rows.has(identity))
        throw comparisonError(
          `Item '${row[matchBy]}' has multiple names or quantity units within ${report.company}. Use consistent Item Codes and units in Tally.`,
        );
      safeCents(row.sales_cents);
      safeCents(row.return_cents);
      rows.set(identity, row);
    }
    return rows;
  });
  if (selectedCode && maps.every((rows) => rows.size === 0))
    throw comparisonError(
      `Item Code '${input.item_code.trim()}' was not found in either company.`,
      404,
    );
  const metrics = (row) => ({
    stock_item: row?.stock_item || null,
    item_code: row?.item_code || null,
    unit: row?.unit || null,
    has_sales: Boolean(
      row && (row.sales_quantity || row.return_quantity || row.sales_cents || row.return_cents),
    ),
    sales_quantity: roundQuantity(row?.sales_quantity || 0),
    sales_amount: (row?.sales_cents || 0) / 100,
    return_quantity: roundQuantity(row?.return_quantity || 0),
    return_amount: (row?.return_cents || 0) / 100,
    quantity: roundQuantity(
      (row?.sales_quantity || 0) - (basis === "net" ? row?.return_quantity || 0 : 0),
    ),
    amount:
      safeCents((row?.sales_cents || 0) - (basis === "net" ? row?.return_cents || 0 : 0)) / 100,
  });
  const rows = [...new Set([...maps[0].keys(), ...maps[1].keys()])].sort().map((identity) => {
    const a = maps[0].get(identity),
      b = maps[1].get(identity);
    const first = metrics(a),
      second = metrics(b);
    const sameUnit =
      !a ||
      !b ||
      key(a.unit) === key(b.unit) ||
      (!a.unit && a.sales_quantity === 0 && a.return_quantity === 0) ||
      (!b.unit && b.sales_quantity === 0 && b.return_quantity === 0);
    const quantityDifference = sameUnit ? roundQuantity(second.quantity - first.quantity) : null;
    const amountDifference = valueComparable
      ? safeCents(Math.round(second.amount * 100) - Math.round(first.amount * 100)) / 100
      : null;
    return {
      item_code: a?.item_code || b?.item_code || null,
      stock_item: a?.stock_item || b?.stock_item,
      match_status: a && b ? "both" : a ? "only_company_a" : "only_company_b",
      company_a: first,
      company_b: second,
      quantity_comparable: sameUnit,
      amount_comparable: valueComparable,
      quantity_difference: quantityDifference,
      quantity_difference_percent: sameUnit ? percent(quantityDifference, first.quantity) : null,
      amount_difference: amountDifference,
      amount_difference_percent: valueComparable ? percent(amountDifference, first.amount) : null,
    };
  });
  const totals = reports.map((report, index) => {
    let sales = 0,
      returns = 0;
    const quantities = new Map();
    for (const row of report.rows) {
      sales = safeCents(sales + row.sales_cents);
      returns = safeCents(returns + row.return_cents);
      if (!row.unit) continue; // An unsold non-quantity item has no unit to total.
      const unitKey = key(row.unit);
      const previous = quantities.get(unitKey) || { unit: row.unit, quantity: 0 };
      previous.quantity = roundQuantity(previous.quantity + metrics(row).quantity);
      quantities.set(unitKey, previous);
    }
    return {
      company_id: input.company_ids[index].trim(),
      sales_amount: sales / 100,
      return_amount: returns / 100,
      amount: safeCents(sales - (basis === "net" ? returns : 0)) / 100,
      quantities: [...quantities.values()],
    };
  });
  const warnings = [];
  if (!valueComparable)
    warnings.push(
      "Amounts are shown in each company's base currency. Amount differences are unavailable because a common currency could not be verified; no currency conversion is performed.",
    );
  if (rows.some((row) => !row.quantity_comparable))
    warnings.push(
      "Some matching items use different quantity units. Their quantity differences are unavailable; units are not converted automatically.",
    );
  return {
    from_date:
      reports[0].from_date === reports[1].from_date && reports[0].to_date === reports[1].to_date
        ? reports[0].from_date
        : null,
    to_date:
      reports[0].from_date === reports[1].from_date && reports[0].to_date === reports[1].to_date
        ? reports[0].to_date
        : null,
    period_mode:
      input.company_periods || input.from_date !== undefined
        ? "requested_periods"
        : "synced_periods",
    match_by: matchBy,
    item_code: input.item_code?.trim() || null,
    sales_basis: basis,
    difference_direction: "company_b_minus_company_a",
    amount_basis: "inventory_line_value_excluding_separate_tax_and_invoice_charges",
    companies: reports.map((report, index) => ({
      company_id: input.company_ids[index].trim(),
      company_name: report.company,
      currency: report.currency || null,
      source: report.source,
      from_date: report.from_date,
      to_date: report.to_date,
      synced_from_date: report.synced_from_date,
      synced_to_date: report.synced_to_date,
      last_synced_at: report.last_synced_at,
      cache_updated_at: report.cache_updated_at,
      read_started_at: report.read_started_at,
      read_completed_at: report.read_completed_at,
    })),
    rows,
    totals,
    total_items: rows.length,
    warnings,
    total_amount_difference: valueComparable
      ? safeCents(Math.round(totals[1].amount * 100) - Math.round(totals[0].amount * 100)) / 100
      : null,
  };
}

export function buildItemSalesComparison(reports, input) {
  const comparisonType = input.comparison_type || "year-wise";
  const summary = buildSummaryComparison(reports, input);
  if (comparisonType === "year-wise") return { ...summary, comparison_type: comparisonType };
  if (comparisonType !== "month-wise")
    throw comparisonError("Use comparison_type year-wise or month-wise.", 400);
  const months = buildMonthComparisons(reports, input, buildSummaryComparison, comparisonError);
  const warnings = [...summary.warnings];
  if (months.some((month) => !month.comparison_available))
    warnings.push(
      "Some months are outside one selected period and cannot be compared. Overall totals still use each company's full selected period.",
    );
  if (months.some((month) => month.partial_month))
    warnings.push(
      "Some monthly periods are partial. Check each company's monthly dates before comparing them.",
    );
  return { ...summary, comparison_type: comparisonType, months, warnings };
}
