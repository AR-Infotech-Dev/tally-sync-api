import test from "node:test";
import assert from "node:assert/strict";
import { buildLedgerPdfData } from "../src/modules/ledgers/ledger-pdf.utils.js";
import { renderLedgerStatementHtml, ledgerPdfFilename, buildLedgerPdfDefinition, generateLedgerStatementPdf } from "../src/modules/ledgers/ledger-pdf.service.js";
import { validateLedgerStatement } from "../src/modules/ledgers/ledger.validator.js";

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
  assert.equal(tables.length,1);assert.equal(tables[0].headerRows,1);assert.equal(tables[0].body.length,88);
  assert.ok(JSON.stringify(definition.content).includes('StatementDevanagari'));
  assert.ok(JSON.stringify(definition.footer(2,3)).includes('Page 2 of 3'));
  const pdf=await generateLedgerStatementPdf(input);
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
});

test('Detail flag accepts yes/no only and defaults to condensed',()=>{
  const input={company:'Sai Enterprises',ledger_name:'Customer',from_date:'2026-10-01',to_date:'2026-10-31'};
  for(const is_detailed of [undefined,'yes','no','YES',' No '])assert.equal(validateLedgerStatement({...input,...(is_detailed===undefined?{}:{is_detailed})}).length,0);
  for(const is_detailed of [true,false,null,1,{},'maybe'])assert.ok(validateLedgerStatement({...input,is_detailed}).some(error=>error.field==='is_detailed'));
  assert.equal(buildLedgerPdfData(statement).is_detailed,false);
});

test('Detailed shows item quantity/rate and bill breakup; condensed retains the same movements and balances',async()=>{
  const input={...statement,details_available:true,entries:[{...statement.entries[0],inventory_entries:[{stock_item:'Laptop <A>',quantity:'20 Nos',rate:'699.00/Nos',amount:13980}],bill_allocations:[{reference:'REF<&>25',type:'New Ref',amount:250,direction:'Dr'}]}]};
  const original=JSON.stringify(input);
  const [detailed,minimal]=await Promise.all([renderLedgerStatementHtml(input,{is_detailed:'yes'}),renderLedgerStatementHtml(input,{is_detailed:'no'})]);
  assert.ok(detailed.includes('Laptop &lt;A&gt;'));assert.ok(detailed.includes('20 Nos'));assert.ok(detailed.includes('699.00/Nos'));assert.ok(detailed.includes('REF&lt;&amp;&gt;25'));assert.ok(detailed.includes('Goods supplied'));
  for(const value of ['Laptop','REF&lt;&amp;&gt;25','Goods supplied'])assert.ok(!minimal.includes(value));
  for(const key of ['total_debit','total_credit','opening_balance','closing_balance','grand_debit','grand_credit'])assert.equal(buildLedgerPdfData(input,{is_detailed:'yes'})[key],buildLedgerPdfData(input,{is_detailed:'no'})[key]);
  assert.equal(buildLedgerPdfData(input).entries.length,1);
  assert.equal(JSON.stringify(input),original);
  const pdf=await generateLedgerStatementPdf(input,{is_detailed:'yes'});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
});

test('Tally-style closing balance is on the balancing side and legacy detail gaps are explicit',async()=>{
  const input={...statement,opening_balance:{amount:0,type:null},total_debit:27960,total_credit:101000,closing_balance:{amount:73040,type:'Cr'},details_available:false};
  const data=buildLedgerPdfData(input,{is_detailed:'yes'});
  assert.equal(data.closing_debit,'73,040.00');assert.equal(data.closing_credit,'');assert.equal(data.grand_debit,'1,01,000.00');assert.equal(data.grand_credit,'1,01,000.00');
  const html=await renderLedgerStatementHtml(input,{is_detailed:'yes'});assert.ok(html.includes('Detailed item and bill breakup is not synced yet'));
  const debit=buildLedgerPdfData({...input,opening_balance:{amount:100,type:'Dr'},total_debit:100,total_credit:0,closing_balance:{amount:200,type:'Dr'}});
  assert.equal(debit.closing_credit,'200.00');assert.equal(debit.grand_debit,debit.grand_credit);
});
test("Empty and stale statements render explicit template notices; filenames are header-safe", async () => {
  const html=await renderLedgerStatementHtml({...statement,entries:[],is_stale:true});
  assert.ok(html.includes('No transactions in this period.'));assert.ok(html.includes('latest Tally changes may not be included'));
  assert.equal(/[\r\n]/.test(ledgerPdfFilename({...statement,ledger_name:'Customer\r\nInjected'})),false);
});

test("Independent export options override legacy detail defaults and render valid five-column PDFs", async () => {
  const input={...statement,entries:[{...statement.entries[0],inventory_entries:[{stock_item:"Visible Item",amount:250}],bill_allocations:[{reference:"HIDDEN-BILL",amount:250}],bank_allocations:[{transaction_type:"Cheque",bank_name:"Demo Bank",instrument_number:"CHQ123",status:"Pending"}]}]};
  const options={report_format:"condensed",show_voucher_no:"no",show_inventory_details:"yes",show_bill_wise_details:"no",show_narrations:"yes",show_payment_receipt_mode:"yes",show_bank_details:"yes",enable_stripe_view:"yes"};
  const html=await renderLedgerStatementHtml(input,options);
  for(const value of ["Visible Item","Goods supplied","Cheque","Demo Bank","CHQ123","Pending"])assert.ok(html.includes(value));
  for(const value of ["HIDDEN-BILL","Vch No.","0044"])assert.ok(!html.includes(value));
  const pdf=await generateLedgerStatementPdf(input,options);assert.equal(pdf.subarray(0,5).toString(),"%PDF-");
  assert.equal(buildLedgerPdfData(input,options).grand_credit,buildLedgerPdfData(input).grand_credit);
  const definition=await buildLedgerPdfDefinition({...input,entries:[...input.entries,...input.entries]},options);
  assert.ok(JSON.stringify(definition).includes("#f1f5fa"));
});
test("Export option validation identifies the invalid field",()=>{
  const input={ledger_name:"Customer",from_date:"2026-10-01",to_date:"2026-10-31"};
  for(const field of ["show_narrations","show_voucher_no","show_bill_wise_details","show_inventory_details","show_payment_receipt_mode","show_bank_details","enable_stripe_view"])assert.ok(validateLedgerStatement({...input,[field]:true}).some(error=>error.field===field));
  assert.ok(validateLedgerStatement({...input,report_format:"other"}).some(error=>error.field==="report_format"));
});
