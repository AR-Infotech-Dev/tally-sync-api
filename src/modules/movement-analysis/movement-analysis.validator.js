import { normalizeMovementOptions } from "./movement-analysis.options.js";
export function validateMovementAnalysis(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [{ field: "body", message: "A JSON object is required." }];
  const errors = [];
  for (const field of ["company_id", "stock_item"]) if (typeof body[field] !== "string" || !body[field].trim() || body[field].length > 500 || /[\x00-\x1f]/.test(body[field])) errors.push({ field, message: `${field} must be a non-empty string.` });
  for (const field of ["from_date", "to_date"]) {
    const value = body[field];
    const valid = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!valid || value < "1900-01-01" || value > "2099-12-31") errors.push({ field, message: "Use a valid YYYY-MM-DD date between 1900 and 2099." });
  }
  if (body.from_date > body.to_date) errors.push({ field: "to_date", message: "to_date must be on or after from_date." });
  if (body.analysis_type !== undefined && body.analysis_type !== "stock-item") errors.push({ field: "analysis_type", message: "Only stock-item analysis is supported." });
  if (body.movement_type !== undefined && !["all", "inward", "outward"].includes(body.movement_type)) errors.push({ field: "movement_type", message: "Use all, inward or outward." });
  try { normalizeMovementOptions(body); } catch (error) { errors.push({ field: error.field, message: error.message }); }
  return errors;
}
