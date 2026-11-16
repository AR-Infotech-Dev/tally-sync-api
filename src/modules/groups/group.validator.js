import { isCompanySequence } from "../companies/company-sequence.model.js";

export function validateGroupList(body) {
  
  if (!body || typeof body !== "object" || Array.isArray(body))
    return [{ field: "body", message: "A JSON object is required." }];
  const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
  return isCompanySequence(companyId)
    ? []
    : [{ field: "company_id", message: "A valid company_id is required." }];
}

