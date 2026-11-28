import { mfgJournalItems, calculateMfgJournalOutputs } from "./mfg-journal.items.js";
import { isVoucherDate } from "../../shared/utils/dateValidation.js";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) =>
  typeof value === "string" && !!value.trim() && value.length <= 500 && !/[\x00-\x1f]/.test(value);
const numeric = (value) =>
  (typeof value === "number" || (typeof value === "string" && !!value.trim())) &&
  Number.isFinite(Number(value));

export function validateMfgJournal(journal) {
  const errors = [];
  const add = (field, message) => errors.push({ field: `mfg_journal.${field}`, message });
  if (!object(journal))
    return [{ field: "mfg_journal", message: "A manufacturing journal object is required." }];
  if (!isVoucherDate(journal.date || journal.voucher_date))
    add("date", "A real voucher date is required (YYYY-MM-DD, YYYYMMDD or DD-MM-YYYY).");
  for (const field of ["voucher_type", "voucher_number", "reference"])
    if (journal[field] !== undefined && !text(journal[field]))
      add(field, `${field} must be a non-empty string up to 500 characters.`);
  if (
    journal.narration !== undefined &&
    (typeof journal.narration !== "string" ||
      journal.narration.length > 10000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(journal.narration))
  )
    add(
      "narration",
      "Narration must be text up to 10000 characters without XML control characters.",
    );
  if (journal.bom_name !== undefined)
    add(
      "bom_name",
      "BOM expansion is not supported; provide explicit consumption and production lines instead.",
    );
  if (Array.isArray(journal.production) && journal.production.length !== 1)
    add("production", "Use one primary production object; put additional outputs in by_product.");
  const groups = {
    consumption: journal.consumption,
    production: [mfgJournalItems(journal).primary],
    by_product: journal.by_product ?? [],
  };
  for (const side of ["consumption", "production", "by_product"]) {
    const items = groups[side];
    if (!Array.isArray(items) || (side !== "by_product" && !items.length) || items.length > 500) {
      add(side, "Provide between 1 and 500 inventory lines.");
      continue;
    }
    items.forEach((item, index) => {
      const field = side === "production" ? "production" : `${side}[${index}]`;
      if (!object(item)) {
        add(field, "Each inventory line must be an object.");
        return;
      }
      if (
        item.item_code !== undefined
          ? !text(item.item_code)
          : !text(item.stock_item || item.item_name || item.name)
      )
        add(`${field}.stock_item`, "A valid stock_item name or item_code is required.");
      if (!numeric(item.quantity) || Number(item.quantity) <= 0)
        add(`${field}.quantity`, "Quantity must be a finite number greater than zero.");
      const percentage = side === "by_product" && item.cost_allocation_percent !== undefined;
      const automaticPrimary =
        side === "production" && item.rate === undefined && item.amount === undefined;
      if (
        (!percentage && !automaticPrimary && item.amount === undefined && !numeric(item.rate)) ||
        (item.rate !== undefined && (!numeric(item.rate) || Number(item.rate) < 0))
      )
        add(
          `${field}.rate`,
          "Provide a non-negative rate or amount; by-products may use cost_allocation_percent.",
        );
      if (
        item.cost_allocation_percent !== undefined &&
        (side !== "by_product" ||
          !numeric(item.cost_allocation_percent) ||
          Number(item.cost_allocation_percent) < 0 ||
          Number(item.cost_allocation_percent) > 100)
      )
        add(
          `${field}.cost_allocation_percent`,
          "Only by_product accepts cost_allocation_percent, from 0 to 100; the primary share is calculated.",
        );
      if (
        item.type !== undefined &&
        (side !== "by_product" || !["co_product", "by_product", "scrap"].includes(item.type))
      )
        add(`${field}.type`, "Only by_product accepts type: co_product, by_product or scrap.");
      if (!text(item.unit)) add(`${field}.unit`, "The exact Tally stock item's unit is required.");
      if (item.amount !== undefined && (!numeric(item.amount) || Number(item.amount) < 0))
        add(
          `${field}.amount`,
          "Amount must be a finite non-negative number; the API applies Tally signs.",
        );
      if (
        numeric(item.quantity) &&
        numeric(item.rate) &&
        !Number.isFinite(Number(item.quantity) * Number(item.rate))
      )
        add(`${field}.amount`, "Calculated amount is too large.");
      for (const key of ["godown", "batch_name", "expiry_period"])
        if (item[key] !== undefined && !text(item[key]))
          add(`${field}.${key}`, `${key} must be non-empty text up to 500 characters.`);
      if (item.manufactured_on !== undefined && !isVoucherDate(item.manufactured_on))
        add(`${field}.manufactured_on`, "Invalid manufacture date.");
      if (item.batch_allocations !== undefined || item.batches !== undefined)
        add(
          `${field}.batch_allocations`,
          "Use separate inventory lines for each batch/godown, with batch_name and godown on each line.",
        );
    });
  }
  if (journal.additional_costs !== undefined) {
    if (!Array.isArray(journal.additional_costs) || journal.additional_costs.length > 100)
      add("additional_costs", "additional_costs must be an array of at most 100 costs.");
    else
      journal.additional_costs.forEach((cost, index) => {
        const field = `additional_costs[${index}]`;
        if (!object(cost)) {
          add(field, "Each cost must be an object.");
          return;
        }
        if (!text(cost.ledger_name))
          add(`${field}.ledger_name`, "An existing Tally cost ledger name is required.");
        if (!numeric(cost.amount) || Number(cost.amount) < 0)
          add(`${field}.amount`, "Cost amount must be finite and non-negative.");
        if (
          cost.allocation_type !== undefined &&
          !["Appropriate by Value", "Appropriate by Qty"].includes(cost.allocation_type)
        )
          add(`${field}.allocation_type`, "Use Appropriate by Value or Appropriate by Qty.");
      });
  }
  if (!errors.length) {
    const percentages = (journal.by_product || []).reduce(
      (sum, item) => sum + Number(item.cost_allocation_percent ?? 0),
      0,
    );
    if (percentages > 100 + 1e-9)
      add("by_product", "Total cost_allocation_percent cannot exceed 100.");
    else {
      try {
        const outputs = calculateMfgJournalOutputs(journal);
        for (const [index, item] of (journal.by_product || []).entries()) {
          if (
            item.cost_allocation_percent !== undefined &&
            item.amount !== undefined &&
            Math.abs(Number(item.amount) - outputs.byProducts[index].amount) > 0.011
          )
            add(
              `by_product[${index}].amount`,
              "Amount conflicts with cost_allocation_percent; omit it to calculate automatically.",
            );
          if (
            item.cost_allocation_percent !== undefined &&
            item.rate !== undefined &&
            Math.abs(Number(item.rate) * Number(item.quantity) - outputs.byProducts[index].amount) >
              0.011
          )
            add(
              `by_product[${index}].rate`,
              "Rate conflicts with cost_allocation_percent; omit it to calculate automatically.",
            );
        }
        const primary = mfgJournalItems(journal).primary;
        if (
          outputs.automatic &&
          primary.amount !== undefined &&
          Math.abs(Number(primary.amount) - outputs.primary.amount) > 0.011
        )
          add(
            "production.amount",
            "Primary amount conflicts with the remaining manufacturing cost; omit it to calculate automatically.",
          );
        if (
          outputs.automatic &&
          primary.rate !== undefined &&
          Math.abs(Number(primary.rate) * Number(primary.quantity) - outputs.primary.amount) > 0.011
        )
          add(
            "production.rate",
            "Primary rate conflicts with the remaining manufacturing cost; omit it to calculate automatically.",
          );
      } catch (error) {
        add("by_product", error.message);
      }
    }
  }
  return errors;
}

export function validateMfgJournalRequest(input) {
  const body = object(input) ? input : {};
  const errors = validateMfgJournal(body.mfg_journal);
  if (!object(body.destination) || !text(body.destination.company_id))
    errors.unshift({
      field: "destination.company_id",
      message: "A valid Tally company_id is required.",
    });
  if (
    body.idempotency_key !== undefined &&
    (typeof body.idempotency_key !== "string" ||
      !body.idempotency_key.trim() ||
      body.idempotency_key.length > 200)
  )
    errors.push({
      field: "idempotency_key",
      message: "Use a non-empty string up to 200 characters.",
    });
  return errors;
}
