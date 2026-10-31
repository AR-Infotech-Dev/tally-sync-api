function yesNo(value, field) {
  if (typeof value !== "string" || !["yes", "no"].includes(value.trim().toLowerCase())) {
    const error = new TypeError(`${field} must be \"yes\" or \"no\".`); error.field = field; throw error;
  }
  return value.trim().toLowerCase() === "yes";
}

export function normalizeGroupSummaryPdfOptions(input = {}) {
  const result = {};
  const flags = [
    "show_opening_balance", "show_transactions", "show_closing_balance", "show_percentages",
    "expand_all_levels", "show_zero_balance", "show_base_currency", "show_page_number",
    "show_company_name", "show_company_address", "show_phone_number", "show_country_code", "enable_stripe_view",
  ];
  for (const field of flags) result[field] = input[field] === undefined ? (!["show_transactions", "show_zero_balance", "enable_stripe_view"].includes(field)) : yesNo(input[field], field);
  result.report_format = input.report_format === undefined ? "condensed" : String(input.report_format).trim().toLowerCase();
  if (!["condensed", "detailed"].includes(result.report_format)) { const error = new TypeError('report_format must be "condensed" or "detailed".'); error.field = "report_format"; throw error; }
  result.grouping_type = input.grouping_type === undefined ? "group-wise" : String(input.grouping_type).trim().toLowerCase();
  if (!["group-wise", "ledger-wise"].includes(result.grouping_type)) { const error = new TypeError('grouping_type must be "group-wise" or "ledger-wise".'); error.field = "grouping_type"; throw error; }
  result.percentage_type = input.percentage_type === undefined ? "of-totals" : String(input.percentage_type).trim().toLowerCase();
  if (!["of-totals", "of-group"].includes(result.percentage_type)) { const error = new TypeError('percentage_type must be "of-totals" or "of-group".'); error.field = "percentage_type"; throw error; }
  result.display_name = input.display_name === undefined ? "name-only" : String(input.display_name).trim().toLowerCase();
  if (!["name-only", "name-and-alias"].includes(result.display_name)) { const error = new TypeError('display_name must be "name-only" or "name-and-alias".'); error.field = "display_name"; throw error; }
  result.scale_factor = input.scale_factor === undefined ? "default" : String(input.scale_factor).trim();
  if (!result.scale_factor) { const error = new TypeError("scale_factor must not be empty."); error.field = "scale_factor"; throw error; }
  return result;
}
