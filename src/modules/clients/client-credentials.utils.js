import { createHash, randomBytes } from 'node:crypto';

export const hashCredential = (value) => createHash('sha256').update(value).digest('hex');
export const connectorKeyForActivation = (code) => createHash('sha256').update(`tally-connector-activation-v1:${code}`).digest('base64url');
export function createActivationCredentials(now = new Date()) {
  const code = randomBytes(32).toString('base64url');
  return { code, hash: hashCredential(code), connectorKey: connectorKeyForActivation(code), expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
}
export function buildCredentialsEmail({name, clientId, connectorId, apiKey, connectorKey, activationCode}) {
  return [
    `Hello ${name},`, '', 'Your Tally Sync account has been created.', '',
    '1. CONNECTOR SETUP — on the computer running TallyPrime',
    `Activation code: ${activationCode}`,
    'Paste this code into Connector Setup. It expires in 24 hours and can be used once.',
    'Then test Tally, select your company and wait for the first sync to complete.', '',
    '2. APPLICATION API CREDENTIALS — for your backend or Postman',
    `X-Client-ID: ${clientId}`, `X-API-Key: ${apiKey}`,
    'The API key is your secret. There is no separate API Secret field.',
    'Keep it in your backend environment or a private Postman environment. Do not put it in browser code.', '',
    '3. MANUAL CONNECTOR SETUP — only if activation fails or the code has expired',
    `Client ID: ${clientId}`, `Connector ID: ${connectorId}`, `Connector Key: ${connectorKey}`,
    'Enter these in Connector Settings. The Connector Key is different from the application API key.', '',
    'Keep this email private. These secrets are not returned by the registration API.',
  ].join('\n');
}
