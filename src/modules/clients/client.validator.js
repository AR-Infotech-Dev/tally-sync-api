const isNonEmptyString = (value, maxLength) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;

export function validateClientRegistration(body = {}) {
  const errors = [];
  if (!isNonEmptyString(body.name, 120)) {
    errors.push({ field: "name", message: "Name is required and must be 120 characters or fewer." });
  }
  if (!isNonEmptyString(body.company_name, 160)) {
    errors.push({ field: "company_name", message: "Company name is required and must be 160 characters or fewer." });
  }
  if (!isNonEmptyString(body.email, 254) || !/^\S+@\S+\.\S+$/.test(body.email.trim())) {
    errors.push({ field: "email", message: "A valid email address is required." });
  }
  if (!isNonEmptyString(body.tally_license_no, 100)) {
    errors.push({ field: "tally_license_no", message: "Tally license number is required and must be 100 characters or fewer." });
  }
  return errors;
}
