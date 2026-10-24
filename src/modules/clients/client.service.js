import { createHash, randomBytes, randomUUID } from "node:crypto";
import { activateClient, createClient, deleteClient, consumeActivation } from "./client.model.js";
import { createActivationCredentials, hashCredential, connectorKeyForActivation } from './client-credentials.utils.js';
import { sendClientCredentialsEmail } from "./client.mailer.js";

function createServiceError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function registerClient(input) {
  const clientId = `CLIENT_${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const connectorId = `CONNECTOR_${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const apiKey = randomBytes(32).toString("base64url");
  const activation = createActivationCredentials();
  const connectorKey = activation.connectorKey;
  const normalizedEmail = input.email.trim().toLowerCase();
  const client = {
    client_id: clientId,
    connector_id: connectorId,
    name: input.name.trim(),
    company_name: input.company_name.trim(),
    email: normalizedEmail,
    tally_license_no: input.tally_license_no.trim().toUpperCase(),
    api_key_hash: createHash("sha256").update(apiKey).digest("hex"),
    connector_key_hash: createHash("sha256").update(connectorKey).digest("hex"),
    status: "pending_email",
    activation_hash: activation.hash,
    activation_expires_at: activation.expiresAt,
    created_at: new Date(),
  };

  try {
    await createClient(client);
  } catch (error) {
    if (error.code === 11000) {
      throw createServiceError("This Tally license number is already registered.", 409);
    }
    throw error;
  }

  try {
    await sendClientCredentialsEmail({
      email: normalizedEmail,
      name: client.name,
      clientId,
      connectorId,
      apiKey,
      connectorKey,
      activationCode: activation.code,
    });
  } catch (cause) {
    await deleteClient(clientId).catch(() => {});
    const error = createServiceError(
      cause.status === 503 ? cause.message : "Could not deliver client credentials by email.",
      cause.status || 503,
    );
    error.cause = cause;
    throw error;
  }

  const activated = await activateClient(clientId);
  if (!activated) {
    throw createServiceError("Credentials were emailed, but client activation failed. Contact support before using these credentials.", 503);
  }

  return { clientId, connectorId, email: normalizedEmail };
}

export async function activateConnector(code) {
  const client = await consumeActivation(hashCredential(code));
  if (!client) throw createServiceError('Activation code is invalid, expired or already used. Use the manual Connector credentials from your registration email.', 401);
  return { client_id: client.client_id, connector_id: client.connector_id, connector_key: connectorKeyForActivation(code) };
}
