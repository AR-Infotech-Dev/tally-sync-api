import { createHash, randomBytes } from 'node:crypto';

export const hashCredential = (value) => createHash('sha256').update(value).digest('hex');
export const connectorKeyForActivation = (code) => createHash('sha256').update(`tally-connector-activation-v1:${code}`).digest('base64url');
export function createActivationCredentials(now = new Date()) {
  const code = randomBytes(32).toString('base64url');
  return { code, hash: hashCredential(code), connectorKey: connectorKeyForActivation(code), expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
}
export { buildCredentialsEmailText as buildCredentialsEmail } from "./client-email.template.js";
