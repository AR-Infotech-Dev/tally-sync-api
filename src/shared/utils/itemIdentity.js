export function validateItemIdentity(item, field) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [{ field, message: "Each item must be a JSON object." }];
  if (item.item_code !== undefined) {
    if (typeof item.item_code !== "string" || !item.item_code.trim() || item.item_code.length > 500 || /[\x00-\x1f]/.test(item.item_code)) return [{ field: `${field}.item_code`, message: "item_code must be a non-empty string up to 500 characters." }];
    return [];
  }
  const name = item.stock_item || item.item_name || item.name;
  return typeof name === "string" && name.trim() && name.length <= 500 && !/[\x00-\x1f]/.test(name) ? [] : [{ field: `${field}.stock_item`, message: "item_code or a valid stock_item name up to 500 characters is required." }];
}
