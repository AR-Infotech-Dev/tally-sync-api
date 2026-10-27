import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import express from "express";
import { io as connectSocket } from "../../Connector/node_modules/socket.io-client/build/esm/index.js";
import { initSocket, getIO } from "../src/socket/index.js";
import { connectorRoom } from "../src/socket/utils/rooms.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { assertConnectorAvailable, assertNoAvailabilityFailure } from "../src/modules/connectors/connectorAvailability.service.js";
import { queueSalesOrder } from "../src/modules/sales-order/sales.service.js";
import { registerTallyAvailabilityCheck } from "../../Connector/src/main/services/tallyAvailability.service.js";
import { tallyFailureResult } from "../../Connector/src/main/utils/tallyFailure.js";
import { requireConnectedConnector } from "../src/middlewares/connectedConnector.middleware.js";
import { requireClientApiKey } from "../src/middlewares/clientApiKey.middleware.js";
import salesOrderRouter from "../src/modules/sales-order/sales.router.js";
import salesRouter from "../src/modules/sales/sales.router.js";
import receiptRouter from "../src/modules/receipts/receipt.router.js";
import purchaseOrderRouter from "../src/modules/purchases/purchase-order.router.js";
import purchaseRouter from "../src/modules/purchases/purchase.router.js";
import paymentRouter from "../src/modules/purchases/payment.router.js";
import ledgerRouter from "../src/modules/ledgers/ledger.router.js";

// Real Express, Socket.IO and Tally HTTP transport; only Tally and socket identity
// are fixtures. No registration DB, production MongoDB, or financial imports.
async function fixture(t) {
  const app=express();app.use(express.json());
  let controllerCalls=0;
  const reachedController=(_req,res)=>{controllerCalls++;res.json({success:true});};
  app.get('/guard',(_req,_res,next)=>{_req.client={client_id:'CLIENT_TEST'};next();},requireConnectedConnector,reachedController);
  app.get('/guard-without-auth',requireConnectedConnector,reachedController);
  app.post('/queue',(req,res,next)=>queueSalesOrder({client_id:'CLIENT_TEST',transaction_type:req.body.transaction_type})
    .then(()=>res.sendStatus(500)).catch(next));
  app.get('/check',(req,res,next)=>assertConnectorAvailable('CLIENT_TEST',{requireTally:req.query.cached!=='1'})
    .then(()=>res.json({success:true})).catch(next));
  app.use(errorHandler);
  const server=http.createServer(app);initSocket(server);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const clients=[];
  t.after(async()=>{clients.forEach(c=>c.disconnect());await new Promise(resolve=>getIO().close(resolve));});
  async function connector({clientId='CLIENT_TEST',registered=true,tallyUrl,responsive=true}={}) {
    const client=connectSocket(base,{autoConnect:false,reconnection:false,transports:['websocket']});clients.push(client);
    if(responsive)registerTallyAvailabilityCheck(client,{tallyUrl});
    const connected=once(getIO(),'connection');client.connect();
    const [socket]=await connected;await once(client,'connect');
    if(registered){socket.data.clientId=clientId;socket.data.connectorId='CONNECTOR_TEST';await socket.join(connectorRoom(clientId));}
    return client;
  }
  return {base,connector,controllerCalls:()=>controllerCalls};
}

async function tallyFixture(t,hang=false) {
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;requests.push(body);
    if(hang)return;
    res.setHeader('Content-Type','text/xml');
    res.end('<ENVELOPE><BODY><DATA><COLLECTION><COMPANY><NAME>Test Company</NAME><GUID>fixture</GUID></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>');
  });server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  return {server,url:`http://127.0.0.1:${server.address().port}`,requests};
}

test('Offline, unregistered and another client Connector return 503 before any job is created',async t=>{
  const f=await fixture(t);
  for(const transaction_type of ['sales_order','sales_voucher','receipt_voucher','purchase_order','purchase_voucher','payment_voucher','sales_order_lookup','sales_voucher_lookup','ledger_statement']){
    const response=await fetch(f.base+'/queue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({transaction_type})});
    assert.equal(response.status,503);
    const result=await response.json();assert.equal(result.success,false);assert.equal(result.code,2013);assert.equal(result.type,'SERVICE_UNAVAILABLE');assert.equal(result.error_code,'CONNECTOR_NOT_CONNECTED');
  }
  await f.connector({registered:false});
  assert.equal((await fetch(f.base+'/check')).status,503);
  await f.connector({clientId:'CLIENT_OTHER'});
  assert.equal((await fetch(f.base+'/check')).status,503);
});

test('Connected Connector and stopped Tally return a distinct 503; cached ledger work needs no Tally',async t=>{
  const tally=await tallyFixture(t);await new Promise(resolve=>tally.server.close(resolve));
  const f=await fixture(t);await f.connector({tallyUrl:tally.url});
  const response=await fetch(f.base+'/queue',{method:'POST',headers:{'content-type':'application/json'},body:'{"transaction_type":"sales_order"}'});
  assert.equal(response.status,503);const result=await response.json();
  assert.equal(result.code,2014);assert.equal(result.error_code,'TALLY_NOT_CONNECTED');assert.match(result.message,/Start Tally/);
  assert.equal((await fetch(f.base+'/check?cached=1')).status,200);
});

test('Healthy preflight executes an export-only Tally request and passes',async t=>{
  const tally=await tallyFixture(t),f=await fixture(t);await f.connector({tallyUrl:tally.url});
  assert.equal((await fetch(f.base+'/check')).status,200);
  assert.equal(tally.requests.length,1);assert.match(tally.requests[0],/<TALLYREQUEST>Export<\/TALLYREQUEST>/);assert.doesNotMatch(tally.requests[0],/Import Data/);
  assert.equal((await fetch(f.base+'/guard')).status,200);
  assert.equal(tally.requests.length,1,'Connector-only liveness checks must not contact Tally');
});

test('A hanging Tally reports timeout instead of claiming a successful connection',async t=>{
  const previous=process.env.CONNECTOR_HEALTH_TIMEOUT_MS;process.env.CONNECTOR_HEALTH_TIMEOUT_MS='1000';
  t.after(()=>{if(previous===undefined)delete process.env.CONNECTOR_HEALTH_TIMEOUT_MS;else process.env.CONNECTOR_HEALTH_TIMEOUT_MS=previous;});
  const tally=await tallyFixture(t,true),f=await fixture(t);await f.connector({tallyUrl:tally.url});
  const response=await fetch(f.base+'/check');assert.equal(response.status,504);
  const result=await response.json();assert.equal(result.error_code,'TALLY_TIMEOUT');
});

test('An older/unresponsive Connector has a bounded health-check timeout',async t=>{
  const previous=process.env.CONNECTOR_HEALTH_TIMEOUT_MS;process.env.CONNECTOR_HEALTH_TIMEOUT_MS='100';
  t.after(()=>{if(previous===undefined)delete process.env.CONNECTOR_HEALTH_TIMEOUT_MS;else process.env.CONNECTOR_HEALTH_TIMEOUT_MS=previous;});
  const f=await fixture(t);await f.connector({responsive:false});
  const response=await fetch(f.base+'/check');assert.equal(response.status,504);assert.equal((await response.json()).error_code,'CONNECTOR_CHECK_TIMEOUT');
});

test('Connection failures after preflight survive job metadata; normal import rejection stays unchanged',()=>{
  const error=Object.assign(new Error('refused'),{code:'TALLY_NOT_CONNECTED',httpStatus:503});
  const result=tallyFailureResult(error);assert.equal(result.error_code,'TALLY_NOT_CONNECTED');
  assert.throws(()=>assertNoAvailabilityFailure({request_id:'job',status:'failed',tally_result:result}),e=>e.apiCode===2014&&e.status===503&&e.data.request_id==='job');
  assert.equal(tallyFailureResult(new Error('Stock Item missing')),null);
  assert.doesNotThrow(()=>assertNoAvailabilityFailure({status:'failed',error:'Stock Item missing'}));
});

test('Connection middleware blocks the controller and checks only the authenticated client ID',async t=>{
  const f=await fixture(t);
  const response=await fetch(f.base+'/guard');assert.equal(response.status,503);
  assert.equal((await response.json()).error_code,'CONNECTOR_NOT_CONNECTED');assert.equal(f.controllerCalls(),0);
  assert.equal((await fetch(f.base+'/guard-without-auth',{headers:{'x-client-id':'CLIENT_TEST'}})).status,401);
  await f.connector({clientId:'CLIENT_OTHER'});
  assert.equal((await fetch(f.base+'/guard',{headers:{'x-client-id':'CLIENT_OTHER'}})).status,503);
  assert.equal(f.controllerCalls(),0);
});

test('Connection middleware permits a registered connected client and blocks it after disconnect',async t=>{
  const f=await fixture(t);const client=await f.connector();
  assert.equal((await fetch(f.base+'/guard')).status,200);assert.equal(f.controllerCalls(),1);
  const disconnected=once(getIO().sockets.sockets.get(client.id),'disconnect');client.disconnect();await disconnected;
  assert.equal((await fetch(f.base+'/guard')).status,503);assert.equal(f.controllerCalls(),1);
});

test('A stale registered socket fails its liveness ACK without waiting for a job timeout',async t=>{
  const previous=process.env.CONNECTOR_PING_TIMEOUT_MS;process.env.CONNECTOR_PING_TIMEOUT_MS='100';
  t.after(()=>{if(previous===undefined)delete process.env.CONNECTOR_PING_TIMEOUT_MS;else process.env.CONNECTOR_PING_TIMEOUT_MS=previous;});
  const f=await fixture(t);await f.connector({responsive:false});
  const start=performance.now();const response=await fetch(f.base+'/guard');
  const duration=Math.round(performance.now()-start);
  assert.equal(response.status,503);assert.equal((await response.json()).error_code,'CONNECTOR_NOT_RESPONDING');
  assert.equal(f.controllerCalls(),0);
  t.diagnostic(`Stale Connector response: ${duration}ms with a 100ms probe timeout`);
});

test('Live voucher and statement routes mount connection middleware after API authentication',()=>{
  const cases=[
    [salesOrderRouter,'post','/push'],[salesOrderRouter,'get','/'],
    [salesRouter,'post','/push'],[salesRouter,'get','/'],
    [receiptRouter,'post','/push'],[purchaseOrderRouter,'post','/push'],
    [purchaseRouter,'post','/push'],[paymentRouter,'post','/push'],
    [ledgerRouter,'post','/statement'],[ledgerRouter,'post','/statement/pdf'],
  ];
  for(const [router,method,path]of cases){
    const route=router.stack.find(layer=>layer.route?.path===path&&layer.route.methods[method]).route;
    assert.equal(route.stack[0].handle,requireClientApiKey);
    assert.equal(route.stack[1].handle,requireConnectedConnector);
  }
  for(const router of [salesOrderRouter,salesRouter,receiptRouter,purchaseOrderRouter,purchaseRouter,paymentRouter,ledgerRouter]){
    for(const layer of router.stack.filter(layer=>layer.route?.path.includes(':requestId')&&!layer.route.path.includes('pdf'))){
      assert.ok(!layer.route.stack.some(middleware=>middleware.handle===requireConnectedConnector));
    }
  }
});
