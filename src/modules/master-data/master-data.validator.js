import { validateItemIdentity } from "../../shared/utils/itemIdentity.js";
import { validateGroupList } from "../groups/group.validator.js";

export function validateMasterData(body, catalog) {
  const errors = validateGroupList(body);
  if (errors.length) return errors;
  for (const field of ["group", "search"]) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 500 || /[\x00-\x1f]/.test(value))
      errors.push({ field, message: `${field} must be a string up to 500 characters.` });
  }
  if (catalog === "stock_availability") {
    const item = { item_code: body.item_code, stock_item: body.stock_item };
    for (const error of validateItemIdentity(item, "item"))
      errors.push({ ...error, field: error.field.replace(/^item\./, "") });
  }
  return errors;
}
