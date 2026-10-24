import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSalesOrderRequest} from '../src/modules/sales-order/sales.validator.js';
import {validatePurchaseRequest} from '../src/modules/purchases/purchase.validator.js';
const order={date:'2026-10-31',order_number:'6',party:{ledger_name:'Customer'},items:[{stock_item:'Laptop',quantity:20,rate:699}]};
test('Orders fail validation before queueing when allocation due dates are missing or invalid',()=>{
  assert.ok(validateSalesOrderRequest({destination:{company:'Example'},sales_order:order}).some(e=>e.field==='sales_order.order_due_date'));
  assert.ok(validatePurchaseRequest({destination:{company:'Example'},purchase_order:order},'purchase_order').some(e=>e.field==='purchase_order.order_due_date'));
  assert.ok(validateSalesOrderRequest({destination:{company:'Example'},sales_order:{...order,order_due_date:'2026-02-30'}}).length);
});
test('Order-level and per-item due dates pass; purchase invoices do not require order due dates',()=>{
  assert.deepEqual(validateSalesOrderRequest({destination:{company:'Example'},sales_order:{...order,order_due_date:'2026-11-07'}}),[]);
  assert.deepEqual(validateSalesOrderRequest({destination:{company:'Example'},sales_order:{...order,items:[{...order.items[0],order_due_date:'2026-11-07'}]}}),[]);
  assert.deepEqual(validatePurchaseRequest({destination:{company:'Example'},purchase:{...order,purchase_ledger:'Purchase'}},'purchase_voucher'),[]);
});
