import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { JSDOM } from "jsdom";
import { renderClientCredentialsEmail } from "../src/modules/clients/client-email.template.js";
import { buildClientCredentialsMessage } from "../src/modules/clients/client.mailer.js";

const input = { email: "demo@example.test", name: "Demo Customer", clientId: "CLIENT_DEMO", connectorId: "CONNECTOR_DEMO", apiKey: "demo-api-key", connectorKey: "demo-connector-key", activationCode: "demo-activation-code" };

test("credentials template renders every credential and setup section", () => {
  const { html, text } = renderClientCredentialsEmail(input);
  for (const value of [input.name, input.clientId, input.connectorId, input.apiKey, input.connectorKey, input.activationCode]) {
    assert.ok(html.includes(value));
    assert.ok(text.includes(value));
  }
  for (const section of ["Connector Setup", "Application API Credentials", "Manual Connector Setup"]) assert.ok(html.includes(section));
  assert.ok(!html.includes("{{"));
  assert.ok(text.includes("no separate API Secret"));
});

test("HTML escapes dynamic data without changing selectable credential text", () => {
  const special = { ...input, name: '<img src=x onerror="alert(1)">', apiKey: '<script>alert("secret")</script>&key' };
  const { html, text } = renderClientCredentialsEmail(special);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll("script,img,[onclick],[onerror]").length, 0);
  assert.ok(document.body.textContent.includes(special.name));
  assert.ok(document.body.textContent.includes(special.apiKey));
  assert.ok(text.includes(special.apiKey));
});

test("mail contains HTML and plain-text alternatives without sending SMTP", async () => {
  const message = buildClientCredentialsMessage(input, "sender@example.test");
  assert.equal(message.to, input.email);
  assert.equal(message.from, "sender@example.test");
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail(message);
  const mime = result.message.toString();
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /text\/plain/);
  assert.match(mime, /text\/html/);
});

test("missing credentials fail with a field name only", () => {
  assert.throws(() => renderClientCredentialsEmail({ ...input, activationCode: "" }), /Missing credentials email field: activation_code/);
});
