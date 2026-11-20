// Mirrored in Connector/src/shared/ledgerCreate.contract.js; both apps deploy independently.
export const ledgerCreateFields = [
  "name",
  "parent",
  "dealer_code",
  "bill_wise",
  "alias",
  "description",
  "credit_details",
  "mailing_details",
  "tax_details",
  "bank_details",
  "opening_balance",
];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const ledgerText = (value, max, optional = false) =>
  typeof value === "string" &&
  (optional || value.trim().length > 0) &&
  value.trim().length <= max &&
  !/[\u0000-\u001f\u007f\ufffe\uffff]/u.test(value) &&
  value.isWellFormed();

export function validateLedgerFields(ledger) {
  const errors = [];
  const add = (field, message) => errors.push({ field: `ledger.${field}`, message });
  if (!object(ledger)) return [{ field: "ledger", message: "Ledger data must be an object." }];
  for (const key of Object.keys(ledger))
    if (!ledgerCreateFields.includes(key)) add(key, "Unsupported ledger field.");
  for (const key of ["name", "parent"])
    if (!ledgerText(ledger[key], 255))
      add(key, `A non-empty ${key} of at most 255 characters is required.`);
  for (const [key, max] of [
    ["dealer_code", 200],
    ["alias", 255],
    ["description", 1000],
  ])
    if (ledger[key] !== undefined && !ledgerText(ledger[key], max, true))
      add(key, `Use a string of at most ${max} characters without control characters.`);
  if (
    typeof ledger.alias === "string" &&
    typeof ledger.name === "string" &&
    ledger.alias.trim() &&
    ledger.alias.trim().normalize("NFKC").toLowerCase() ===
      ledger.name.trim().normalize("NFKC").toLowerCase()
  )
    add("alias", "Alias must differ from the ledger name.");
  if (ledger.bill_wise !== undefined && typeof ledger.bill_wise !== "boolean")
    add("bill_wise", "bill_wise must be true or false.");
  const nested = (key, fields, nullable = false) => {
    const value = ledger[key];
    if (value === undefined || (nullable && value === null)) return null;
    if (!object(value)) {
      add(key, `Use an object${nullable ? " or null" : ""}.`);
      return null;
    }
    if (!Object.keys(value).length) add(key, "Supply at least one supported detail.");
    for (const field of Object.keys(value))
      if (!fields.includes(field)) add(`${key}.${field}`, "Unsupported field.");
    return value;
  };
  const credit = nested("credit_details", [
    "default_credit_period_days",
    "check_credit_days_during_voucher_entry",
  ]);
  if (credit) {
    if (
      credit.default_credit_period_days !== undefined &&
      (!Number.isInteger(credit.default_credit_period_days) ||
        credit.default_credit_period_days < 0 ||
        credit.default_credit_period_days > 36500)
    )
      add(
        "credit_details.default_credit_period_days",
        "Use a whole number of days from 0 to 36500.",
      );
    if (
      credit.check_credit_days_during_voucher_entry !== undefined &&
      typeof credit.check_credit_days_during_voucher_entry !== "boolean"
    )
      add("credit_details.check_credit_days_during_voucher_entry", "Use true or false.");
  }
  const mailing = nested("mailing_details", ["name", "address", "state", "country", "pincode"]);
  if (mailing) {
    for (const key of ["name", "state", "country", "pincode"])
      if (
        mailing[key] !== undefined &&
        !ledgerText(mailing[key], key === "pincode" ? 20 : 255, true)
      )
        add(`mailing_details.${key}`, "Use a valid text value.");
    if (mailing.address !== undefined) {
      if (!Array.isArray(mailing.address) || mailing.address.length > 10)
        add("mailing_details.address", "Use up to 10 address lines.");
      else
        mailing.address.forEach((line, index) => {
          if (!ledgerText(line, 255))
            add(
              `mailing_details.address.${index}`,
              "Use a non-empty address line up to 255 characters.",
            );
        });
    }
  }
  const tax = nested("tax_details", ["pan", "registration_type", "gstin"]);
  if (tax) {
    for (const [key, regex, message] of [
      ["pan", /^[A-Z]{5}\d{4}[A-Z]$/, "Use a valid 10-character PAN or an empty string."],
      [
        "gstin",
        /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/,
        "Use a valid 15-character GSTIN or an empty string.",
      ],
    ])
      if (
        tax[key] !== undefined &&
        (!ledgerText(tax[key], key === "pan" ? 10 : 15, true) ||
          (tax[key].trim() && !regex.test(tax[key].trim().toUpperCase())))
      )
        add(`tax_details.${key}`, message);
    if (
      tax.registration_type !== undefined &&
      ![
        "Regular",
        "Composition",
        "Unregistered",
        "Unregistered/Consumer",
        "Consumer",
        "Unknown",
      ].includes(tax.registration_type)
    )
      add(
        "tax_details.registration_type",
        "Use Regular, Composition, Unregistered/Consumer, Consumer or Unknown.",
      );
    if (
      typeof tax.pan === "string" &&
      typeof tax.gstin === "string" &&
      tax.pan.trim() &&
      tax.gstin.trim() &&
      tax.pan.trim().toUpperCase() !== tax.gstin.trim().slice(2, 12).toUpperCase()
    )
      add("tax_details.gstin", "GSTIN must contain the supplied PAN.");
  }
  const bank = nested(
    "bank_details",
    ["account_holder_name", "bank_name", "branch", "account_number", "ifsc_code"],
    true,
  );
  if (bank) {
    for (const key of ["account_holder_name", "bank_name", "account_number"])
      if (!ledgerText(bank[key], key === "account_number" ? 40 : 255))
        add(`bank_details.${key}`, "A non-empty text value is required.");
    if (bank.branch !== undefined && !ledgerText(bank.branch, 255, true))
      add("bank_details.branch", "Use a valid branch name.");
    if (
      bank.ifsc_code !== undefined &&
      (!ledgerText(bank.ifsc_code, 11, true) ||
        (bank.ifsc_code.trim() &&
          !/^[A-Z]{4}0[A-Z\d]{6}$/.test(bank.ifsc_code.trim().toUpperCase())))
    )
      add("bank_details.ifsc_code", "Use a valid 11-character IFSC or an empty string.");
  }
  const opening = nested("opening_balance", ["amount", "type"]);
  if (opening) {
    const amount = opening.amount;
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      !Number.isSafeInteger(Math.round(amount * 100)) ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    )
      add("opening_balance.amount", "Use a non-negative amount with at most two decimal places.");
    if (!["Dr", "Cr"].includes(opening.type)) add("opening_balance.type", "Use Dr or Cr.");
  }
  return errors;
}

export function normalizeLedgerFields(ledger) {
  const result = {
    name: ledger.name.trim(),
    parent: ledger.parent.trim(),
    dealer_code: (ledger.dealer_code || "").trim(),
    bill_wise: ledger.bill_wise === true,
  };
  for (const key of ["alias", "description"])
    if (ledger[key] !== undefined) result[key] = ledger[key].trim();
  const schemas = {
    credit_details: ["default_credit_period_days", "check_credit_days_during_voucher_entry"],
    mailing_details: ["name", "address", "state", "country", "pincode"],
    tax_details: ["pan", "registration_type", "gstin"],
    bank_details: ["account_holder_name", "bank_name", "branch", "account_number", "ifsc_code"],
    opening_balance: ["amount", "type"],
  };
  for (const [key, fields] of Object.entries(schemas)) {
    if (ledger[key] === undefined) continue;
    if (ledger[key] === null) {
      result[key] = null;
      continue;
    }
    result[key] = {};
    for (const field of fields)
      if (ledger[key][field] !== undefined) {
        let value = ledger[key][field];
        if (typeof value === "string") value = value.trim();
        if (Array.isArray(value)) value = value.map((line) => line.trim());
        if (["pan", "gstin", "ifsc_code"].includes(field)) value = value.toUpperCase();
        if (field === "registration_type" && value === "Unregistered")
          value = "Unregistered/Consumer";
        result[key][field] = value;
      }
  }
  return result;
}
