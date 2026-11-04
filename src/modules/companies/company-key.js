import { createHash } from "node:crypto";

export function companyIdentity(row) {
  const tally_guid = String(row.tally_guid || "")
    .trim()
    .toLowerCase();
  const company_name = String(row.company_name || "").trim();
  const rawNumber = String(row.company_number || "")
    .trim()
    .replace(/\.0+$/, "");
  const company_number = /^\d+$/.test(rawNumber) && /[1-9]/.test(rawNumber) ? rawNumber : "";
  const data_path = String(row.data_path || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  const absolutePath = /^(?:[a-z]:\/|\/\/[^/]+\/[^/]+)/i.test(data_path);
  const identity_basis = company_number && absolutePath ? "locator" : "name";
  const locator =
    identity_basis === "locator"
      ? [company_number, data_path]
      : [company_name.normalize("NFKC").toLowerCase()];
  const hash = createHash("sha256")
    .update(JSON.stringify(["tally-company-v2", tally_guid, identity_basis, ...locator]))
    .digest("hex")
    .slice(0, 32);
  const company_key = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
  return { tally_guid, company_name, company_number, data_path, company_key, identity_basis };
}
