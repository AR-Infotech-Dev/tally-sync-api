import test from "node:test";
import assert from "node:assert/strict";
import { buildLedgerPdfData } from "../src/modules/ledgers/ledger-pdf.utils.js";
import { renderLedgerStatementHtml, ledgerPdfFilename, buildLedgerPdfDefinition, generateLedgerStatementPdf } from "../src/modules/ledgers/ledger-pdf.service.js";

const statement = { company: "Sai Enterprises", ledger_name: "Customer", from_date: "2026-10-01", to_date: "2026-10-31", opening_balance: {amount:1000,type:"Cr"}, closing_balance:{amount:750,type:"Cr"}, total_debit:250,total_credit:0,entries:[{date:"2026-10-31",voucher_no:"0044",voucher_type:"Sales New",particulars:["Sales","GST"],narration:"Goods supplied",debit:250,credit:0,balance:{amount:750,type:"Cr"}}] };

test("PDF view model formats money and dates without changing voucher identifiers", () => {
  const data=buildLedgerPdfData(statement);
  assert.equal(data.opening_balance,"1,000.00 Cr");assert.equal(data.entries[0].voucher_no,"0044");assert.equal(data.entries[0].date,"31-10-2026");assert.equal(data.entries[0].particulars,"Sales, GST");assert.equal(data.entries[0].credit,"-");
});

test("Statement template includes every row across financial years", async () => {
  const entries = Array.from({length:83}, (_, index) => ({...statement.entries[0], date:index < 82 ? '2025-04-01' : '2026-04-01', voucher_no:`history-row-${index}`}));
  const input = {...statement, from_date:'2025-01-01', to_date:'2026-10-31', entries};
  assert.equal(buildLedgerPdfData(input).entries.length, 83);
  const html = await renderLedgerStatementHtml(input);
  for (const entry of entries) assert.ok(html.includes(entry.voucher_no));
});
test("Handlebars escapes statement values before HTML conversion", async () => {
  const html=await renderLedgerStatementHtml({...statement,company:'<script>alert(1)</script>',entries:[{...statement.entries[0],narration:'<img src="https://external.invalid">'}]});
  assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>alert'),false);assert.equal(html.includes('<img src='),false);
  assert.equal(html.includes('@font-face'),false);
});

test('HTML conversion retains all rows, repeated headings and real PDF output without a browser',async()=>{
  const input={...statement,company:'Sai Enterprises साई एंटरप्राइजेस',entries:Array.from({length:83},(_,i)=>({...statement.entries[0],voucher_no:`row-${i}`}))};
  const definition=await buildLedgerPdfDefinition(input);
  const tables=[];
  function visit(node){if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){if(node.table)tables.push(node.table);Object.values(node).forEach(visit);}}
  visit(definition.content);
  assert.equal(tables.length,1);assert.equal(tables[0].headerRows,1);assert.equal(tables[0].body.length,86);
  assert.ok(JSON.stringify(definition.content).includes('StatementDevanagari'));
  assert.ok(JSON.stringify(definition.footer(2,3)).includes('Page 2 of 3'));
  const pdf=await generateLedgerStatementPdf(input);
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
});
test("Empty and stale statements render explicit template notices; filenames are header-safe", async () => {
  const html=await renderLedgerStatementHtml({...statement,entries:[],is_stale:true});
  assert.ok(html.includes('No transactions in this period.'));assert.ok(html.includes('latest Tally changes may not be included'));
  assert.equal(/[\r\n]/.test(ledgerPdfFilename({...statement,ledger_name:'Customer\r\nInjected'})),false);
});
