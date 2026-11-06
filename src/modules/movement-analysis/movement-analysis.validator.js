import { validateReportDates } from "../../shared/utils/dateValidation.js";
import { normalizeMovementOptions } from "./movement-analysis.options.js";
import { validateItemIdentity } from "../../shared/utils/itemIdentity.js";
export const movementAnalysisTypes = [
  "stock-item",
  "stock-group",
  "stock-category",
  "group",
  "ledger",
  "transfer",
];
export function validateMovementAnalysis(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return [{ field: "body", message: "A JSON object is required." }];
  const errors = [];
  const type = body.analysis_type ?? "stock-item";
  const text = (key, required = false) => {
    const value = body[key];
    if (
      (required || value !== undefined) &&
      (typeof value !== "string" ||
        !value.trim() ||
        value.length > 500 ||
        /[\x00-\x1f]/.test(value))
    )
      errors.push({
        field: key,
        message: key + " must be a non-empty string up to 500 characters.",
      });
  };
  text("company_id", true);
  if (!movementAnalysisTypes.includes(type))
    errors.push({
      field: "analysis_type",
      message: "Use " + movementAnalysisTypes.join(", ") + ".",
    });
  if (type === "stock-item")
    errors.push(
      ...validateItemIdentity(body, "item").map((error) => ({
        ...error,
        field: error.field.replace(/^item\./, ""),
      })),
    );
  const selector = {
    "stock-group": "stock_group",
    "stock-category": "stock_category",
    group: "group",
    transfer: "voucher_type",
  }[type];
  if (selector) text(selector, true);
  if (type === "ledger") {
    if (body.dealer_code === undefined && body.ledger_name === undefined)
      errors.push({ field: "dealer_code", message: "dealer_code or ledger_name is required." });
    text("dealer_code");
    text("ledger_name");
  }
  for (const key of [
    "stock_item",
    "item_code",
    "stock_group",
    "stock_category",
    "group",
    "ledger_name",
    "dealer_code",
    "voucher_type",
  ])
    text(key);
  const allowed =
    {
      "stock-item": ["stock_item", "item_code"],
      "stock-group": ["stock_group"],
      "stock-category": ["stock_category"],
      group: ["group"],
      ledger: ["ledger_name", "dealer_code"],
      transfer: ["voucher_type"],
    }[type] || [];
  for (const key of [
    "stock_item",
    "item_code",
    "stock_group",
    "stock_category",
    "group",
    "ledger_name",
    "dealer_code",
    "voucher_type",
  ])
    if (body[key] !== undefined && !allowed.includes(key))
      errors.push({
        field: key,
        message:
          key + " is not used by " + type + " analysis. Remove it to avoid an ambiguous request.",
      });
  errors.push(...validateReportDates(body));
  if (body.from_date > body.to_date)
    errors.push({ field: "to_date", message: "to_date must be on or after from_date." });
  if (
    body.movement_type !== undefined &&
    !["all", "inward", "outward"].includes(body.movement_type)
  )
    errors.push({ field: "movement_type", message: "Use all, inward or outward." });
  try {
    normalizeMovementOptions(body);
  } catch (error) {
    errors.push({ field: error.field, message: error.message });
  }
  return errors;
}
