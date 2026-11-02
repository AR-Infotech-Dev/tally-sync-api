import { validateReportDates } from "../../shared/utils/dateValidation.js";
import { normalizeMovementOptions } from "./movement-analysis.options.js";
import { validateItemIdentity } from "../../shared/utils/itemIdentity.js";
export function validateMovementAnalysis(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return [{ field: "body", message: "A JSON object is required." }];
  const errors = [];
  for (const field of ["company_id"])
    if (
      typeof body[field] !== "string" ||
      !body[field].trim() ||
      body[field].length > 500 ||
      /[\x00-\x1f]/.test(body[field])
    )
      errors.push({ field, message: `${field} must be a non-empty string.` });
  errors.push(
    ...validateItemIdentity(body, "item").map((error) => ({
      ...error,
      field: error.field.replace(/^item\./, ""),
    })),
  );
  errors.push(...validateReportDates(body));
  if (body.from_date > body.to_date)
    errors.push({ field: "to_date", message: "to_date must be on or after from_date." });
  if (body.analysis_type !== undefined && body.analysis_type !== "stock-item")
    errors.push({ field: "analysis_type", message: "Only stock-item analysis is supported." });
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
