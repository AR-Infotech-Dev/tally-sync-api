import test from 'node:test';
import assert from 'node:assert/strict';
import {createLinuxLibraryCheck} from '../src/modules/ledgers/pdf-browser-libraries.service.js';

test('Missing GLib triggers one root install even for concurrent cached-browser requests',async()=>{
  let installed=false;const calls=[];
  const check=createLinuxLibraryCheck({platform:'linux',uid:()=>0,run:async(command,args)=>{
    calls.push([command,args]);
    if(command==='ldd')return{stdout:installed?'libglib-2.0.so.0 => /lib/libglib-2.0.so.0':'libglib-2.0.so.0 => not found\nlibnss3.so => not found'};
    if(args[0]==='install')installed=true;
    return{stdout:''};
  }});
  await Promise.all([check('/cached/chrome'),check('/cached/chrome')]);
  assert.deepEqual(calls.filter(([command])=>command==='apt-get').map(([,args])=>args),[['update'],['install','-y','--no-install-recommends','chromium']]);
  assert.equal(calls.filter(([command])=>command==='ldd').length,2);
});
test('Non-root deployment gets precise remediation without trying privileged operations',async()=>{
  const check=createLinuxLibraryCheck({platform:'linux',uid:()=>1000,run:async(command)=>{assert.equal(command,'ldd');return{stdout:'libglib-2.0.so.0 => not found'};}});
  await assert.rejects(check('/chrome'),/libglib-2.0.so.0.*Rebuild using Server\/Dockerfile/);
});
test('Healthy Linux binaries need no package operations; Windows skips Linux checks',async()=>{
  let calls=0;const healthy=createLinuxLibraryCheck({platform:'linux',run:async command=>{calls++;assert.equal(command,'ldd');return{stdout:'libglib-2.0.so.0 => /lib/glib.so'};}});
  await healthy('/chrome');await healthy('/chrome');assert.equal(calls,1);
  await createLinuxLibraryCheck({platform:'win32',run:async()=>assert.fail('No Linux command on Windows')})('chrome.exe');
});
test('Libraries still missing after installation fail; a later check can retry',async()=>{
  let healthy=false;const check=createLinuxLibraryCheck({platform:'linux',uid:()=>0,run:async command=>({stdout:command==='ldd'&&!healthy?'libglib-2.0.so.0 => not found':''})});
  await assert.rejects(check('/chrome'),/still has missing Linux libraries/);
  healthy=true;await check('/chrome');
});
