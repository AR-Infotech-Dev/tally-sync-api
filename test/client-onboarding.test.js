import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {createActivationCredentials, hashCredential, connectorKeyForActivation, buildCredentialsEmail} from '../src/modules/clients/client-credentials.utils.js';
import {createActivateConnectorController} from '../src/modules/clients/client.controller.js';
import {activateConnectorRequest} from '../../Connector/src/main/services/clientRegistration.api.js';
import clientRouter from '../src/modules/clients/client.router.js';

test('Mounted clients router exposes POST activate-connector without accessing production data', async t => {
  const app=express(); app.use(express.json()); app.use('/api/v1/clients',clientRouter);
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/clients/activate-connector`,{
    method:'POST',headers:{'content-type':'application/json'},body:'{}',
  });
  assert.equal(response.status,400);
  assert.equal((await response.json()).message,'Paste the complete activation code from your registration email.');
});

test('Activation has independent secret material, a hash and a fixed 24-hour lifetime', () => {
  const now = new Date('2026-10-23T00:00:00Z'); const activation = createActivationCredentials(now);
  assert.match(activation.code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(activation.hash, hashCredential(activation.code));
  assert.notEqual(activation.code, activation.connectorKey);
  assert.equal(activation.connectorKey, connectorKeyForActivation(activation.code));
  assert.equal(activation.expiresAt.getTime() - now.getTime(), 86_400_000);
  assert.notEqual(createActivationCredentials(now).code, activation.code);
});

test('Email clearly separates application headers, activation and manual recovery', () => {
  const email=buildCredentialsEmail({name:'Test',clientId:'CLIENT_TEST',connectorId:'CONNECTOR_TEST',apiKey:'synthetic-api',connectorKey:'synthetic-connector',activationCode:'synthetic-code'});
  assert.ok(email.includes('X-Client-ID: CLIENT_TEST'));
  assert.ok(email.includes('X-API-Key: synthetic-api'));
  assert.ok(email.includes('Activation code: synthetic-code'));
  assert.ok(email.includes('Connector Key: synthetic-connector'));
  assert.ok(email.includes('no separate API Secret'));
});

test('Connector real HTTP client exchanges a code; API rejects malformed/reused codes and returns no API key', async t => {
  const activation=createActivationCredentials(); let redeemed=false; let calls=0;
  const app=express(); app.use(express.json());
  // In-memory activation repository stand-in; no production MongoDB or email.
  app.post('/api/v1/clients/activate-connector',createActivateConnectorController(async code=>{
    calls++;
    if(code!==activation.code || redeemed) throw Object.assign(new Error('Activation code is invalid, expired or already used.'),{status:401});
    redeemed=true; return {client_id:'CLIENT_TEST',connector_id:'CONNECTOR_TEST',connector_key:connectorKeyForActivation(code)};
  }));
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  await assert.rejects(activateConnectorRequest(base,'incomplete'),/complete activation code/); assert.equal(calls,0);
  const result=await activateConnectorRequest(base,activation.code);
  assert.equal(result.connector_key,activation.connectorKey);assert.equal('api_key' in result,false);
  await assert.rejects(activateConnectorRequest(base,activation.code),/already used/);
  const response=await fetch(`${base}/api/v1/clients/activate-connector`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({activation_code:activation.code})});
  assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).success,false);
});

test('Remote activation requires HTTPS before sending a secret', () => {
  assert.throws(()=>activateConnectorRequest('http://example.com','synthetic'),/HTTPS/);
});
