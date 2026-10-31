import { requestConnector } from "../../socket/index.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";

export async function listCompanies(clientId) {
  const response = await requestConnector(clientId, SOCKET_EVENTS.companyList);
  return response.companies || [];
}
