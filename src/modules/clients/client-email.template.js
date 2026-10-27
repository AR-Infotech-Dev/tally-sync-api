import Handlebars from "handlebars";
import { readFileSync } from "node:fs";

const handlebars = Handlebars.create();
const templates = new Map();

function render(filename, data, noEscape = false) {
  if (!templates.has(filename)) {
    const source = readFileSync(new URL(`../../templates/${filename}`, import.meta.url), "utf8");
    templates.set(filename, handlebars.compile(source, { strict: true, noEscape }));
  }
  return templates.get(filename)(data);
}

function emailData({ name, clientId, connectorId, apiKey, connectorKey, activationCode }) {
  const fields = { name, client_id: clientId, connector_id: connectorId, api_key: apiKey, connector_key: connectorKey, activation_code: activationCode };
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`Missing credentials email field: ${field}`);
  }
  return {
    ...fields,
    support_email: "support@flowups.com",
    manual_credentials: [
      { label: "Client ID", value: clientId },
      { label: "Connector ID", value: connectorId },
      { label: "Connector Key", value: connectorKey },
    ],
  };
}

export function buildCredentialsEmailText(input) {
  return render("client-credentials.text.hbs", emailData(input), true);
}

export function renderClientCredentialsEmail(input) {
  const data = emailData(input);
  return {
    html: render("client-credentials.hbs", data),
    text: render("client-credentials.text.hbs", data, true),
  };
}
