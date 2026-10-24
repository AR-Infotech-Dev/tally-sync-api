import test from 'node:test';
import assert from 'node:assert/strict';
import { PUPPETEER_REVISIONS } from 'puppeteer-core';
import { createPdfBrowserResolver } from '../src/modules/ledgers/pdf-browser.service.js';

test('Configured executable takes precedence; invalid configuration fails explicitly', async () => {
  const resolve=createPdfBrowserResolver({env:{PDF_BROWSER_EXECUTABLE_PATH:'/custom/chrome'},exists:async p=>p==='/custom/chrome',installBrowser:async()=>assert.fail('Must not download')});
  assert.equal(await resolve(),'/custom/chrome');
  const missing=createPdfBrowserResolver({env:{PDF_BROWSER_EXECUTABLE_PATH:'/missing'},exists:async()=>false});
  await assert.rejects(missing(),/Correct it or remove it/);
});

test('Concurrent missing-browser requests share one compatible download', async () => {
  let calls=0;
  const resolve=createPdfBrowserResolver({env:{PDF_BROWSER_CACHE_DIR:'/synthetic/cache'},exists:async()=>false,installBrowser:async options=>{
    calls++; assert.equal(options.buildId,PUPPETEER_REVISIONS.chrome);assert.equal(options.cacheDir,'/synthetic/cache');assert.equal(options.installDeps,false);
    await new Promise(r=>setTimeout(r,10));return {executablePath:'/synthetic/cache/chrome'};
  }});
  assert.deepEqual(await Promise.all([resolve(),resolve(),resolve()]),Array(3).fill('/synthetic/cache/chrome'));
  assert.equal(calls,1);
});

test('Cached compatible browser is reused without download; failed installs can retry', async () => {
  const cached=createPdfBrowserResolver({env:{},exists:async p=>p.includes(PUPPETEER_REVISIONS.chrome),installBrowser:async()=>assert.fail('Cache should be reused')});
  assert.ok((await cached()).includes(PUPPETEER_REVISIONS.chrome));
  let calls=0;
  const retry=createPdfBrowserResolver({env:{},exists:async()=>false,installBrowser:async()=>{if(++calls===1)throw new Error('download unavailable');return {executablePath:'/downloaded/chrome'};}});
  await assert.rejects(retry(),/Automatic PDF browser installation failed/);
  assert.equal(await retry(),'/downloaded/chrome');
});
