import { requestConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";
import { normalizeCompanies, selectCompany, companyError } from "./company.identity.js";
import { saveClientCompanies, readClientCompanies } from "./company.model.js";

export function createCompanyRegistry({
  request = requestConnector,
  save = saveClientCompanies,
  read = readClientCompanies,
} = {}) {
  async function list(clientId, { requireLive = false } = {}) {
    let open;
    try {
      const response = await request(clientId, SOCKET_EVENTS.companyList);
      open = normalizeCompanies(clientId, response.companies);
      await save(clientId, open);
    } catch (error) {
      // Availability helpers carry their classification in data.error_code,
      // while socket transport failures use code. Treat both consistently.
      const errorCode = error.data?.error_code || error.error_code || error.code;
      if (
        requireLive ||
        ![
          "CONNECTOR_NOT_CONNECTED",
          "CONNECTOR_NOT_RESPONDING",
          "CONNECTOR_CHECK_TIMEOUT",
          "TALLY_NOT_CONNECTED",
          "TALLY_TIMEOUT",
        ].includes(errorCode)
      ) {
        if (error.apiCode) throw error;
        const timeout = ["CONNECTOR_CHECK_TIMEOUT", "TALLY_TIMEOUT"].includes(errorCode);
        throw companyError(
          errorCode || "COMPANY_DISCOVERY_FAILED",
          error.message,
          timeout ? 504 : 503,
        );
      }
    }
    const known = await read(clientId);
    const live = new Map(open?.map((row) => [row.company_key, row]));
    return known.map((row) => ({
      ...row,
      ...(live.get(row.company_key) || {}),
      status: open ? (live.has(row.company_key) ? "active" : "closed") : "unknown",
    }));
  }
  return {
    list,
    resolve: async (clientId, reference) => {
      if (!reference?.company_id)
        throw companyError("COMPANY_ID_REQUIRED", "company_id is required.", 400);
      return selectCompany(await list(clientId, { requireLive: true }), reference);
    },
  };
}
const registry = createCompanyRegistry();
export const listCompanies = registry.list;
export const resolveRequestCompany = registry.resolve;
