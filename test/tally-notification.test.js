import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import tallyNotificationRouter from "../src/modules/tally-notifications/tally-notification.router.js";
import { createTallyNotificationReceiver } from "../src/modules/tally-notifications/tally-notification.service.js";
import { createTallyNotificationHandler } from "../src/modules/tally-notifications/tally-notification.controller.js";
import { validateTallyNotification } from "../src/modules/tally-notifications/tally-notification.validator.js";
import { parseNotificationXml } from "../src/modules/tally-notifications/tally-notification.xml.js";

const payload = {
  company: "Demo & Co",
  company_guid: "11111111-2222-3333-4444-555555555555",
  master_id: "34",
  action: "update",
};
const company = {
  company_id: "1",
  company_name: payload.company,
  tally_guid: payload.company_guid,
};
const xml = `<FLOWUPSNOTIFICATION><COMPANY>Demo &amp; Co</COMPANY><COMPANY_GUID>${payload.company_guid}</COMPANY_GUID><MASTER_ID>34</MASTER_ID><ACTION>update</ACTION><PREVIOUS_DATE>20261123</PREVIOUS_DATE></FLOWUPSNOTIFICATION>`;

test("notification route requires client credentials over HTTP", async () => {
  const app = express();
  app.use("/api/v1/tally/notifications", tallyNotificationRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/tally/notifications`,
      {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xml,
      },
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).success, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("accepts saved/deleted vouchers and master notifications; rejects invalid identities and dates", () => {
  for (const action of ["create", "update", "cancel", "delete"])
    assert.deepEqual(validateTallyNotification({ ...payload, action }), []);
  assert.deepEqual(
    validateTallyNotification({ ...payload, entity: "masters", master_id: undefined }),
    [],
  );
  for (const patch of [
    { company_guid: "bad" },
    { company: "" },
    { master_id: "-1" },
    { action: "bad" },
    { previous_date: "2026-02-30" },
  ])
    assert.ok(validateTallyNotification({ ...payload, ...patch }).length);
});

test("parses Tally UTF-8 and UTF-16 XML and rejects malformed or unsafe structures", () => {
  for (const buffer of [Buffer.from(xml), Buffer.from("\uFEFF" + xml, "utf16le")]) {
    assert.equal(parseNotificationXml(buffer).company, payload.company);
    assert.equal(parseNotificationXml(buffer).previous_date, "2026-11-23");
  }
  for (const value of [
    "<bad/>",
    xml.replace("</FLOWUPSNOTIFICATION>", "<ACTION>delete</ACTION></FLOWUPSNOTIFICATION>"),
    "<!DOCTYPE x>" + xml,
    xml.replace("</ACTION>", ""),
  ])
    assert.throws(() => parseNotificationXml(Buffer.from(value)));
});

test("accepts Tally report wrappers and empty optional fields without weakening validation", () => {
  const wrapped = `<ENVELOPE>${xml.replace("<PREVIOUS_DATE>20261123</PREVIOUS_DATE>", "<VOUCHER_GUID/><PREVIOUS_DATE/>")}</ENVELOPE>`;
  const body = parseNotificationXml(Buffer.from(wrapped));
  assert.deepEqual(validateTallyNotification(body), []);
  assert.equal(body.voucher_guid, undefined);
  assert.equal(body.previous_date, undefined);
  assert.deepEqual(
    validateTallyNotification(
      parseNotificationXml(Buffer.from(`<ENVELOPE><BODY><DATA>${xml}</DATA></BODY></ENVELOPE>`)),
    ),
    [],
  );
  assert.throws(() => parseNotificationXml(Buffer.from(`<ENVELOPE>${xml}<OTHER/></ENVELOPE>`)));
  assert.throws(() => parseNotificationXml(Buffer.from(`<ENVELOPE>${xml}${xml}</ENVELOPE>`)));
});

test("persists a scoped receipt without contacting Connector, then logs it", async () => {
  const calls = [];
  const receive = createTallyNotificationReceiver({
    read: async (clientId) => {
      assert.equal(clientId, "CLIENT_A");
      return [company];
    },
    save: async (record) => calls.push(["save", record]),
    log: (...args) => calls.push(["log", ...args]),
  });
  const receipt = await receive("CLIENT_A", payload);
  assert.equal(receipt.status, "received");
  assert.equal(receipt.company_id, "1");
  assert.equal(calls[0][0], "save");
  assert.equal(calls[0][1].client_id, "CLIENT_A");
  assert.equal(calls[1][0], "log");
});

test("rejects unknown and ambiguous companies, and never acknowledges failed storage", async () => {
  for (const rows of [[], [company, company]]) {
    const receive = createTallyNotificationReceiver({
      read: async () => rows,
      save: async () => assert.fail("must not save"),
    });
    await assert.rejects(receive("OTHER_CLIENT", payload), {
      code: rows.length ? "COMPANY_AMBIGUOUS" : "COMPANY_NOT_FOUND",
    });
  }
  const receive = createTallyNotificationReceiver({
    read: async () => [company],
    save: async () => {
      throw new Error("storage unavailable");
    },
    log: () => assert.fail("must not log success"),
  });
  await assert.rejects(receive("CLIENT_A", payload), /storage unavailable/);
});

test("HTTP handler uses authenticated client identity and gives XML acknowledgement after saving", async () => {
  let received = false;
  const handler = createTallyNotificationHandler(async (clientId, body) => {
    assert.equal(clientId, "CLIENT_A");
    assert.equal(body.master_id, "34");
    received = true;
    return { notification_id: "test-id", status: "received" };
  });
  const req = { client: { client_id: "CLIENT_A" }, body: Buffer.from(xml), is: () => "text/xml" };
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(value) {
      this.contentType = value;
      return this;
    },
    send(value) {
      assert.ok(received);
      this.body = value;
      return this;
    },
  };
  await handler(req, res, (error) => {
    throw error;
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<STATUS>1<\/STATUS>/);
});
