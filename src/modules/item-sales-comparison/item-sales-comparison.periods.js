export function comparisonPeriods(input) {
  return input.company_ids.map((id) => {
    const company_id = id.trim();
    const period = input.company_periods?.find((row) => row.company_id.trim() === company_id);
    return {
      company_id,
      ...(period
        ? { from_date: period.from_date, to_date: period.to_date }
        : input.from_date !== undefined || input.to_date !== undefined
          ? { from_date: input.from_date, to_date: input.to_date }
          : {}),
    };
  });
}
