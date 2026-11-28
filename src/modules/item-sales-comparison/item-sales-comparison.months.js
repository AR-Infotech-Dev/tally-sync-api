const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const keys = ["sales_quantity", "sales_cents", "return_quantity", "return_cents"];
const zero = () => Object.fromEntries(keys.map((key) => [key, 0]));

// Align April with April across financial years, even when a requested
// subperiod starts later in one company. Do not align by array position.
export function comparisonMonths(report) {
  const firstYear = Number(report.from_date.slice(0, 4));
  const firstMonth = Number(report.from_date.slice(5, 7));
  const baseFY = firstYear - (firstMonth < 4 ? 1 : 0);
  const result = new Map();
  let year = firstYear,
    month = firstMonth;
  while (true) {
    const calendar = `${year}-${String(month).padStart(2, "0")}`;
    if (calendar > report.to_date.slice(0, 7)) break;
    const start = calendar + "-01";
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const fy = year - (month < 4 ? 1 : 0);
    const index = (fy - baseFY) * 12 + ((month + 8) % 12);
    const from = report.from_date > start ? report.from_date : start;
    const to = report.to_date < end ? report.to_date : end;
    result.set(index, {
      month: calendar,
      month_name: monthNames[month - 1],
      month_number: month,
      from_date: from,
      to_date: to,
      partial: from !== start || to !== end,
    });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return result;
}

export function buildMonthComparisons(reports, input, compare, comparisonError) {
  const fail = (message) => {
    throw comparisonError(message, 502);
  };
  const decoded = reports.map((report) => {
    if (
      report.comparison_type !== "month-wise" ||
      report.monthly_data_version !== 1 ||
      !Array.isArray(report.monthly_data)
    )
      fail("Connector did not return monthly cached sales. Update Connector and retry.");
    const periods = comparisonMonths(report);
    const calendars = new Set([...periods.values()].map((period) => period.month));
    const months = new Map(),
      sums = new Map();
    for (const record of report.monthly_data) {
      if (
        !Array.isArray(record) ||
        record.length !== 6 ||
        !calendars.has(record[0]) ||
        !Number.isSafeInteger(record[1]) ||
        record[1] < 0 ||
        record[1] >= report.rows.length ||
        !Number.isFinite(record[2]) ||
        !Number.isSafeInteger(record[3]) ||
        !Number.isFinite(record[4]) ||
        !Number.isSafeInteger(record[5])
      )
        fail("Connector returned invalid monthly sales data. No partial comparison was generated.");
      const [month, index, ...values] = record;
      if (!months.has(month)) months.set(month, new Map());
      if (months.get(month).has(index)) fail("Connector returned duplicate monthly sales rows.");
      const row = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
      months.get(month).set(index, row);
      if (!sums.has(index)) sums.set(index, zero());
      for (const key of keys) sums.get(index)[key] += row[key];
    }
    report.rows.forEach((row, index) => {
      const sum = sums.get(index) || zero();
      for (const key of keys) {
        const value = row[key];
        const matches = key.endsWith("_cents")
          ? Number.isSafeInteger(sum[key]) && sum[key] === value
          : Math.abs(sum[key] - value) <= 1e-8 * Math.max(1, Math.abs(value));
        if (!matches)
          fail(
            "Monthly sales do not match the saved period totals. No partial comparison was generated.",
          );
      }
    });
    return { periods, months };
  });
  return [...new Set(decoded.flatMap((data) => [...data.periods.keys()]))]
    .sort((a, b) => a - b)
    .map((index) => {
      const periods = decoded.map((data) => data.periods.get(index));
      const label = periods.find(Boolean);
      const title = label.month_name + (index >= 12 ? ` (year ${Math.floor(index / 12) + 1})` : "");
      const metadata = {
        period_index: index,
        month_number: label.month_number,
        month_name: label.month_name,
        label: title,
      };
      if (periods.some((period) => !period))
        return {
          ...metadata,
          comparison_available: false,
          companies: reports.map((report, i) => ({
            company_id: report.company_id,
            company_name: report.company,
            covered: Boolean(periods[i]),
            from_date: periods[i]?.from_date || null,
            to_date: periods[i]?.to_date || null,
          })),
          rows: [],
          totals: [],
          total_items: 0,
          total_amount_difference: null,
          message:
            "This month is outside one company's selected cached period; no zero sales were assumed.",
        };
      const monthlyReports = reports.map((report, i) => ({
        ...report,
        from_date: periods[i].from_date,
        to_date: periods[i].to_date,
        period_source: "requested_range",
        rows: report.rows.map((row, rowIndex) => ({
          ...row,
          ...(decoded[i].months.get(periods[i].month)?.get(rowIndex) || zero()),
        })),
      }));
      const monthlyInput = {
        ...input,
        from_date: undefined,
        to_date: undefined,
        company_periods: periods.map((period, i) => ({
          company_id: input.company_ids[i].trim(),
          from_date: period.from_date,
          to_date: period.to_date,
        })),
      };
      return {
        ...compare(monthlyReports, monthlyInput),
        ...metadata,
        comparison_available: true,
        partial_month: periods.some((period) => period.partial),
      };
    });
}
