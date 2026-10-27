import { getIO, listRegisteredConnectors } from "../../socket/index.js";
import { connectorRoom } from "../../socket/utils/rooms.js";
import { SOCKET_EVENTS } from "../../socket/utils/events.js";

const failures = {
  CONNECTOR_NOT_CONNECTED: { code: 2013, status: 503, message: "Connector is not connected. Start the Connector and connect it to the Server." },
  CONNECTOR_NOT_RESPONDING: { code: 2013, status: 503, message: "Connector is not responding. Restart or update the Connector and reconnect it to the Server." },
  TALLY_NOT_CONNECTED: { code: 2014, status: 503, message: "Tally is not connected. Start Tally and check the Connector's Tally URL and port." },
  TALLY_TIMEOUT: { code: 2015, status: 504, message: "Tally did not respond before the connection check timed out." },
  CONNECTOR_CHECK_TIMEOUT: { code: 2015, status: 504, message: "Connector did not respond to the Tally connection check. Check or update the Connector." },
};

export function availabilityError(errorCode, data = {}) {
  const failure = failures[errorCode];
  if (!failure) throw new TypeError("Unsupported availability error code.");
  return Object.assign(new Error(failure.message), { status: failure.status, apiCode: failure.code, data: { ...data, error_code: errorCode } });
}

export function assertConnectorConnected(clientId, data) {
  if (!listRegisteredConnectors().some((connector) => connector.clientId === clientId)) {
    throw availabilityError("CONNECTOR_NOT_CONNECTED", data);
  }
}

/** A registered socket can be stale after a lost network or terminated process. */
export async function assertConnectorResponsive(clientId) {
  assertConnectorConnected(clientId);
  const timeout = Math.max(100, Math.min(5000, Number(process.env.CONNECTOR_PING_TIMEOUT_MS) || 1500));
  let responses;
  try {
    responses = await getIO().to(connectorRoom(clientId)).timeout(timeout)
      .emitWithAck(SOCKET_EVENTS.connectorTallyCheck, { require_tally: false });
  } catch (error) {
    if (error.responses?.some((response) => response?.success === true)) return;
    assertConnectorConnected(clientId);
    throw availabilityError("CONNECTOR_NOT_RESPONDING");
  }
  if (!responses.some((response) => response?.success === true)) throw availabilityError("CONNECTOR_NOT_RESPONDING");
}

/** Read-only preflight: never queue new live work while its dependencies are offline. */
export async function assertConnectorAvailable(clientId, { requireTally = true } = {}) {
  assertConnectorConnected(clientId);
  if (!requireTally) return assertConnectorResponsive(clientId);
  const timeout = Number(process.env.CONNECTOR_HEALTH_TIMEOUT_MS) || 5000;
  let responses;
  try {
    responses = await getIO().to(connectorRoom(clientId)).timeout(timeout + 1000)
      .emitWithAck(SOCKET_EVENTS.connectorTallyCheck, { timeout_ms: timeout });
  } catch (error) {
    if (error.responses?.some((response) => response?.success === true)) return;
    assertConnectorConnected(clientId);
    throw availabilityError("CONNECTOR_CHECK_TIMEOUT");
  }
  if (responses.some((response) => response?.success === true)) return;
  assertConnectorConnected(clientId);
  throw availabilityError(responses.some((response) => response?.error_code === "TALLY_TIMEOUT") ? "TALLY_TIMEOUT" : "TALLY_NOT_CONNECTED");
}

/** Structured Connector errors only; ordinary Tally validation keeps its existing response. */
export function assertNoAvailabilityFailure(request) {
  const code = request?.tally_result?.error_code;
  if (request?.status === "failed" && failures[code]) {
    throw availabilityError(code, { request_id: request.request_id, status: request.status });
  }
}
