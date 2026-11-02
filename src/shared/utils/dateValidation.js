/** Preserve each endpoint's existing date policy instead of coercing all dates alike. */
export function isVoucherDate(value, { flexibleYearFirst = true, trim = true } = {}) {
  if (typeof value !== "string") return false;
  const text = trim ? value.trim() : value;
  let match = flexibleYearFirst
    ? text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/) || text.match(/^(\d{4})(\d{2})(\d{2})$/)
    : text.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})$/);
  let year;
  let month;
  let day;
  if (match) [, year, month, day] = match;
  else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [, day, month, year] = match;
    if (year.length === 2) year = `20${year}`;
  } else return false;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

export function isIsoDate(value, { bounded = false } = {}) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    (!bounded || (value >= "1900-01-01" && value <= "2099-12-31"))
  );
}

export function validateReportDates(body) {
  return ["from_date", "to_date"]
    .filter((field) => !isIsoDate(body[field], { bounded: true }))
    .map((field) => ({ field, message: "Use a valid YYYY-MM-DD date between 1900 and 2099." }));
}
