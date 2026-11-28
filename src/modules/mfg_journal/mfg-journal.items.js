// Shared request interpretation; identical in Server and Connector.
export function mfgJournalItems(journal) {
  const primary = Array.isArray(journal.production) ? journal.production[0] : journal.production;
  return { primary, consumption: journal.consumption, byProducts: journal.by_product ?? [] };
}

const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const amountOf = (item) => Number(item.amount ?? Number(item.quantity) * Number(item.rate));

/** Resolve percentages against consumption plus additional costs, before XML rendering. */
export function calculateMfgJournalOutputs(journal) {
  const { primary, consumption, byProducts } = mfgJournalItems(journal);
  const totalCost = money(
    consumption.reduce((sum, item) => sum + money(amountOf(item)), 0) +
      (journal.additional_costs || []).reduce((sum, cost) => sum + money(Number(cost.amount)), 0),
  );
  const calculated = byProducts.map((item) => {
    const amount =
      item.cost_allocation_percent !== undefined
        ? money((totalCost * Number(item.cost_allocation_percent)) / 100)
        : money(amountOf(item));
    return {
      ...item,
      amount,
      rate: amount / Number(item.quantity),
      cost_allocation_percent:
        item.cost_allocation_percent !== undefined
          ? Number(item.cost_allocation_percent)
          : totalCost
            ? (amount / totalCost) * 100
            : 0,
    };
  });
  const byProductCost = money(calculated.reduce((sum, item) => sum + item.amount, 0));
  const hasPercent = byProducts.some((item) => item.cost_allocation_percent !== undefined);
  const automatic = hasPercent || (primary.rate === undefined && primary.amount === undefined);
  const amount = automatic ? money(totalCost - byProductCost) : money(amountOf(primary));
  if (
    !Number.isFinite(totalCost) ||
    !Number.isFinite(byProductCost) ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    byProductCost > totalCost
  )
    throw new TypeError(
      "By-product costs cannot exceed the effective manufacturing cost; totals must be finite.",
    );
  if (
    !Number.isFinite(amount / Number(primary.quantity)) ||
    calculated.some((item) => !Number.isFinite(item.rate))
  )
    throw new TypeError("Calculated manufacturing rates must be finite.");
  return {
    primary: {
      ...primary,
      amount,
      rate: amount / Number(primary.quantity),
      cost_allocation_percent: totalCost ? (amount / totalCost) * 100 : 0,
    },
    byProducts: calculated,
    totalCost,
    byProductCost,
    automatic,
  };
}
