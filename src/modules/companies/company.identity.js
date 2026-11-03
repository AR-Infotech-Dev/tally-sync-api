import { isCompanySequence } from "./company-sequence.model.js";

export const companyError = (code, message, status = 409) =>
  Object.assign(new Error(message), {
    code,
    status,
    httpStatus: status,
    apiCode: 2012,
    data: { error_code: code },
  });
export function normalizeCompanies(clientId, rows) {
  if (!Array.isArray(rows))
    throw companyError("COMPANY_DISCOVERY_INVALID", "Connector returned no company list.");
  const companies = rows.map((row) => {
    const rawGuid = String(row.tally_guid || "").trim();
    const guid = rawGuid.toLowerCase();
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(guid) ||
      !row.company_name?.trim()
    )
      throw companyError(
        "COMPANY_DISCOVERY_INVALID",
        "Update Connector: every company must include its Tally GUID and name.",
      );
    return {
      tally_guid: guid,
      company_name: row.company_name.trim(),
      last_synced_at: row.last_synced_at || null,
      sync_status: row.sync_status || "not_synced",
    };
  });
  if (new Set(companies.map((row) => row.tally_guid)).size !== companies.length)
    throw companyError("COMPANY_DISCOVERY_INVALID", "Connector returned duplicate company GUIDs.");
  return companies;
}
export function selectCompany(rows, reference = {}) {
  const id = String(reference.company_id || "");
  if (!id) throw companyError("COMPANY_ID_REQUIRED", "company_id is required.", 400);
  const company = rows.find((row) => isCompanySequence(id) && row.company_id === id);
  if (!company)
    throw companyError("COMPANY_NOT_FOUND", "Company ID does not exist for this client.", 404);
  if (company.status !== "active")
    throw companyError(
      "COMPANY_NOT_OPEN",
      "The requested company is not open in Tally. Open it and retry.",
    );
  if (
    rows.filter(
      (row) =>
        row.status === "active" &&
        row.company_name.trim().toLowerCase() === company.company_name.trim().toLowerCase(),
    ).length !== 1
  )
    throw companyError(
      "COMPANY_AMBIGUOUS",
      "Multiple open Tally companies share this name. Close the other company before retrying.",
    );
  return {
    company_id: company.company_id,
    company_guid: company.tally_guid,
    company: company.company_name,
  };
}
