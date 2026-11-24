import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Server } from "socket.io";
import { createTallyNotificationDispatcher } from "../src/modules/tally-notifications/tally-notification.dispatch.js";
import { createTallyNotificationReceiver } from "../src/modules/tally-notifications/tally-notification.service.js";
const nativeGuid = "11111111-2222-3333-4444-555555555555";
const companyKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const notification = {
  company: "Demo",
  company_guid: nativeGuid,
  master_id: "34",
  action: "update",
  entity: "voucher",
};

test(
  "stored offline notification is delivered over a real socket, queued durably and deduplicated after acknowledgement loss",
  {
    skip: !existsSync(
      new URL("../../Connector/src/main/services/serverNotification.service.js", import.meta.url),
    ),
  },
  async (t) => {
    // Optional cross-app integration check; each application's production checkout is independent.
    const { createServerNotificationHandler } =
      await import("../../Connector/src/main/services/serverNotification.service.js");
    const { createTallyNotificationStore } =
      await import("../../Connector/src/main/models/tallyNotification.model.js");
    const require = createRequire(new URL("../../Connector/package.json", import.meta.url));
    const { io: connect } = require("socket.io-client");
    const http = createServer();
    const io = new Server(http);
    t.after(() => io.close());
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const db = new DatabaseSync(":memory:");
    t.after(() => db.close());
    const store = createTallyNotificationStore(db);
    let registered = false;
    let peer;
    const rows = [];
    let loseAck = true;
    const dispatch = createTallyNotificationDispatcher({
      connected: () => registered,
      read: async (clientId) =>
        rows.filter((row) => row.client_id === clientId && row.status === "received"),
      markDelivered: async (clientId, id) => {
        rows.find((r) => r.client_id === clientId && r.notification_id === id).status = "delivered";
      },
      request: async (clientId, event, payload) => {
        assert.equal(clientId, "CLIENT_A");
        const reply = await new Promise((resolve, reject) =>
          peer
            .timeout(1000)
            .emit(event, payload, (error, ack) => (error ? reject(error) : resolve(ack))),
        );
        if (loseAck) {
          loseAck = false;
          throw new Error("lost acknowledgement");
        }
        assert.equal(reply.success, true);
        return reply;
      },
      log: () => {},
    });
    const receive = createTallyNotificationReceiver({
      read: async () => [
        { company_name: "Demo", tally_guid: nativeGuid, company_id: "01", company_key: companyKey },
      ],
      save: async (row) => rows.push(row),
      dispatch,
      log: () => {},
    });
    const receipt = await receive("CLIENT_A", notification);
    await dispatch("CLIENT_A");
    assert.equal(rows[0].status, "received");
    assert.equal(store.next("scope"), undefined);
    const connected = new Promise((resolve) =>
      io.once("connection", (socket) => {
        peer = socket;
        resolve();
      }),
    );
    const client = connect(`http://127.0.0.1:${http.address().port}`, { autoConnect: false });
    t.after(() => client.disconnect());
    client.on(
      "tally:notification",
      createServerNotificationHandler({
        config: { clientId: "CLIENT_A" },
        isRegistered: () => true,
        enqueue: (event) => store.enqueue("scope", event),
      }),
    );
    client.connect();
    await connected;
    registered = true;
    assert.equal(await dispatch("CLIENT_A"), 0);
    const job = store.next("scope");
    const event = JSON.parse(job.payload);
    assert.equal(event.notification_id, receipt.notification_id);
    assert.equal(event.master_id, "34");
    assert.equal(event.company_guid, nativeGuid);
    assert.equal(event.company_key, companyKey);
    assert.equal(event.action, "update");
    store.complete(job.id);
    assert.equal(await dispatch("CLIENT_A"), 1);
    assert.equal(rows[0].status, "delivered");
    assert.equal(
      store.next("scope"),
      undefined,
      "redelivery must not requeue even after local completion",
    );
  },
);

test("delivery rejects foreign scope and non-durable acknowledgements", async () => {
  const row = { ...notification, notification_id: "id", client_id: "OTHER" };
  const foreign = createTallyNotificationDispatcher({
    connected: () => true,
    read: async () => [row],
    request: () => assert.fail("foreign delivery"),
  });
  await assert.rejects(foreign("CLIENT_A"), /scope mismatch/);
  const invalid = createTallyNotificationDispatcher({
    connected: () => true,
    read: async () => [{ ...row, client_id: "CLIENT_A" }],
    request: async () => ({ success: true, status: "received", notification_id: "id" }),
    markDelivered: () => assert.fail("not queued"),
    log: () => {},
  });
  assert.equal(await invalid("CLIENT_A"), 0);
});
