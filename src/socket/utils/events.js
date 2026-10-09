export const SOCKET_EVENTS = Object.freeze({
  connectorRegister: "connector:register",
  connectorRegistered: "connector:registered",
  connectorHeartbeat: "connector:heartbeat",
  connectorHeartbeatAck: "connector:heartbeat:ack",
  connectorAck: "connector:ack",
  connectorTest: "connector:test",
  salesOrderPush: "sales-order:push",
  salesOrderUpdate: "sales-order:update",
  tallySync: "tally:sync",
});
