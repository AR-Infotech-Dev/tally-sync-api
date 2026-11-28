import { validateReportDates } from "../../shared/utils/dateValidation.js";
import { isCompanySequence } from "../companies/company-sequence.model.js";

export function validateItemSalesComparison (body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return [{ field: "body", message: "A JSON object is required." }];
  const errors = [];
  if (!Array.isArray(body.company_ids) || body.company_ids.length !== 2)
    errors.push({ field: "company_ids", message: "Provide exactly two different company IDs." });
  else {
    body.company_ids.forEach((id, index) => {
      if (typeof id !== "string" || !isCompanySequence(id.trim()))
        errors.push({
          field: `company_ids.${index}`,
          message: "Use a company_id returned by /companies.",
        });
    });
    if (String(body.company_ids[0]).trim() === String(body.company_ids[1]).trim())
      errors.push({ field: "company_ids", message: "Select two different companies." });
  }
  if (body.from_date !== undefined || body.to_date !== undefined)
    errors.push(...validateReportDates(body));
  if (body.from_date > body.to_date)
    errors.push({ field: "to_date", message: "to_date must be on or after from_date." });
  if (body.company_periods !== undefined) {
    if (body.from_date !== undefined || body.to_date !== undefined)
      errors.push({
        field: "company_periods",
        message: "Use company_periods or common from_date/to_date, not both.",
      });
    if (!Array.isArray(body.company_periods) || body.company_periods.length !== 2)
      errors.push({
        field: "company_periods",
        message: "Provide a period for each of the two selected companies.",
      });
    else {
      const ids = [];
      body.company_periods.forEach((period, index) => {
        const prefix = `company_periods.${index}`;
        if (!period || typeof period !== "object" || Array.isArray(period)) {
          errors.push({
            field: prefix,
            message: "A company_id, from_date and to_date object is required.",
          });
          return;
        }
        if (
          typeof period.company_id !== "string" ||
          !Array.isArray(body.company_ids) ||
          !body.company_ids.some(
            id => typeof id === "string" && id.trim() === period.company_id.trim(),
          )
        )
          errors.push({
            field: prefix + ".company_id",
            message: "Use one of the selected company_ids.",
          });
        else ids.push(period.company_id.trim());
        errors.push(
          ...validateReportDates(period).map(error => ({
            ...error,
            field: prefix + "." + error.field,
          })),
        );
        if (period.from_date > period.to_date)
          errors.push({
            field: prefix + ".to_date",
            message: "to_date must be on or after from_date.",
          });
        for (const field of Object.keys(period))
          if (!["company_id", "from_date", "to_date"].includes(field))
            errors.push({ field: prefix + "." + field, message: "Unsupported period field." });
      });
      if (new Set(ids).size !== 2)
        errors.push({
          field: "company_periods",
          message: "Each selected company needs its own period exactly once.",
        });
    }
  }
  if (body.match_by !== undefined && !["item_code", "stock_item"].includes(body.match_by))
    errors.push({ field: "match_by", message: "Use item_code or stock_item." });
  if (body.sales_basis !== undefined && !["net", "gross"].includes(body.sales_basis))
    errors.push({ field: "sales_basis", message: "Use net or gross." });
  if (
    body.comparison_type !== undefined &&
    !["year-wise", "month-wise"].includes(body.comparison_type)
  )
    errors.push({ field: "comparison_type", message: "Use year-wise or month-wise." });
  for (const field of ["item_code", "stock_item"])
    if (
      body[field] !== undefined &&
      (typeof body[field] !== "string" ||
        !body[field].trim() ||
        body[field].length > 500 ||
        /[\x00-\x1f]/.test(body[field]))
    )
      errors.push({
        field,
        message: `Use a non-empty ${
          field === "item_code" ? "Item Code" : "Stock Item Name"
        } up to 500 characters, or omit the selector for all stock items.`,
      });
  if (body.item_code !== undefined && body.stock_item !== undefined)
    for (const field of ["item_code", "stock_item"])
      errors.push({ field, message: "Use item_code or stock_item, not both." });
  const allowed = new Set([
    "company_ids",
    "from_date",
    "to_date",
    "match_by",
    "sales_basis",
    "item_code",
    "stock_item",
    "company_periods",
    "comparison_type",
  ]);
  for (const key of Object.keys(body))
    if (!allowed.has(key)) errors.push({ field: key, message: "Unsupported comparison field." });
  return errors;
}
