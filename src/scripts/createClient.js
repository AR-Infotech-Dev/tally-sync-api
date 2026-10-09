import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "../modules/clients/client.model.js";

const clientId = process.argv[2];
const name = process.argv.slice(3).join(" ").trim() || clientId;

if (!clientId || !/^[A-Za-z0-9_-]{1,100}$/.test(clientId)) {
  console.error("Usage: npm run client:create -- <CLIENT_ID> [Client Name]");
  process.exitCode = 1;
} else {
  const apiKey = randomBytes(32).toString("base64url");
  const connectorKey = randomBytes(32).toString("base64url");
  const client = {
    client_id: clientId,
    name,
    api_key_hash: createHash("sha256").update(apiKey).digest("hex"),
    connector_key_hash: createHash("sha256").update(connectorKey).digest("hex"),
    status: "active",
    created_at: new Date(),
  };

  try {
    await createClient(client);
    console.info(`Client created: ${clientId}`);
    console.info("CRM API key (store in CRM; shown only once):");
    console.info(apiKey);
    console.info("Connector key (store in the Connector app; shown only once):");
    console.info(connectorKey);
  } catch (error) {
    console.error(error.code === 11000 ? "That client_id already exists." : "Could not create client.");
    if (process.env.NODE_ENV !== "production") console.error(error.message);
    process.exitCode = 1;
  }
}
