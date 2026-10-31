export const movementFlags = {
  show_quantity: true, show_basic_rate_and_effective_rate: true, show_value: true,
  show_suppliers: true, show_transfers_inward: true, show_job_work_transfer_inward: false,
  show_buyers: true, show_transfers_outward: true, show_job_work_transfer_outward: false,
};
export function normalizeMovementOptions(input = {}) {
  const options = {};
  for (const [key, fallback] of Object.entries(movementFlags)) {
    if (input[key] !== undefined && !["yes", "no"].includes(input[key])) throw Object.assign(new TypeError(`${key} must be yes or no.`), { field: key });
    options[key] = input[key] === undefined ? fallback : input[key] === "yes";
  }
  if (input.display_name !== undefined && input.display_name !== "name-only") throw Object.assign(new TypeError("Only name-only ledger display is currently supported."), { field: "display_name" });
  if (!options.show_quantity && !options.show_value && !options.show_basic_rate_and_effective_rate) throw Object.assign(new TypeError("Enable at least one movement value column."), { field: "show_quantity" });
  return options;
}
