const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateSalesPdfLookup(query = {}) {
  const lookup = {
    company: query.company,
    ledgerName: query.ledger_name ?? query.party_ledger,
    voucherNumber: query.voucher_no ?? query.voucher_number,
    voucherDate: query.voucher_date,
  };
  const errors = [];
  for (const [field, value] of Object.entries(lookup)) {
    if (field === "voucherDate" && value === undefined) continue;
    if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\x00-\x1f]/.test(value)) {
      errors.push({ field, message: `${field} must be a non-empty string up to 500 characters.` });
    } else lookup[field] = value.trim();
  }
  if (lookup.voucherDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(lookup.voucherDate) || !isRealDate(lookup.voucherDate))) {
    errors.push({ field: "voucher_date", message: "voucher_date must be a real YYYY-MM-DD date." });
  }
  return { lookup, errors };
}

function isRealDate(value) {
  if (typeof value !== "string") return false;
  const input = value.trim();
  let year;
  let month;
  let day;
  let match;
  if ((match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)) || (match = input.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    [, year, month, day] = match;
  } else if ((match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [, day, month, year] = match;
    if (year.length === 2) year = `20${year}`;
  } else {
    return false;
  }

  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day);
}

function getPartyLedger(sales) {
  return sales.party_ledger
    || sales.party_name
    || sales.customer_ledger
    || sales.customer_name
    || sales.party?.ledger_name
    || sales.party_ledger_entry?.ledger;
}

export function validateSalesVoucherRequest(input = {}) {
  const body = isObject(input) ? input : {};
  const errors = [];
  const sales = body.sales;

  if (!isObject(body.destination) || !(body.destination.company || body.destination.company_name)) {
    errors.push({ field: "destination.company", message: "Tally company name is required." });
  }
  if (!isObject(sales) || Object.keys(sales).length === 0) {
    errors.push({ field: "sales", message: "Sales voucher data must be a non-empty JSON object." });
    return errors;
  }

  const date = sales.date || sales.voucher_date;
  if (!isRealDate(date)) {
    errors.push({ field: "sales.date", message: "A valid voucher date is required. Use YYYY-MM-DD, YYYYMMDD, or DD-MM-YYYY." });
  }
  if (!getPartyLedger(sales)) {
    errors.push({ field: "sales.party_ledger", message: "Customer ledger is required." });
  }
  if (sales.total_amount !== undefined && (!Number.isFinite(Number(sales.total_amount)) || Number(sales.total_amount) < 0)) {
    errors.push({ field: "sales.total_amount", message: "Total amount must be a zero or positive number." });
  }
  if (sales.party_ledger_entry?.amount !== undefined && !Number.isFinite(Number(sales.party_ledger_entry.amount))) {
    errors.push({ field: "sales.party_ledger_entry.amount", message: "Party ledger amount must be a number." });
  }

  const items = sales.items || sales.line_items || sales.lineItems;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push({ field: "sales.items", message: "At least one sales item is required." });
  } else {
    items.forEach((item, index) => {
      const field = `sales.items[${index}]`;
      if (!isObject(item)) {
        errors.push({ field, message: "Each item must be a JSON object." });
        return;
      }
      if (!(item.stock_item || item.item_name || item.name)) {
        errors.push({ field: `${field}.item_name`, message: "Stock item name is required." });
      }
      if (!(item.sales_ledger || sales.sales_ledger)) {
        errors.push({ field: `${field}.sales_ledger`, message: "Sales ledger is required on the item or sales voucher." });
      }
      const quantity = Number(item.quantity ?? item.qty);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push({ field: `${field}.quantity`, message: "Quantity must be greater than zero." });
      }
      const rate = Number(item.rate ?? item.unit_rate);
      if (!Number.isFinite(rate) || rate < 0) {
        errors.push({ field: `${field}.rate`, message: "Rate must be zero or greater." });
      }
      if (item.amount !== undefined && !Number.isFinite(Number(item.amount))) {
        errors.push({ field: `${field}.amount`, message: "Amount must be a number." });
      }
    });
  }

  if (body.idempotency_key !== undefined && (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200)) {
    errors.push({ field: "idempotency_key", message: "idempotency_key must be a string of at most 200 characters." });
  }

  return errors;
}
