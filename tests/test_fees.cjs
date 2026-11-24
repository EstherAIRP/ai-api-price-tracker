const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const fees = require('../site/fees.js');
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '../site/data/provider-fees.json'),'utf8'));
const cfg = policy.providers.OpenRouter;
test('Standard minimum $0.80 applies to small non-crypto top-ups', () => {
  assert.deepEqual(fees.topup(5,cfg.standard), {credits:5, fee:0.8, payment:5.8});
});
test('Standard $100 costs $105.50', () => {
  assert.deepEqual(fees.topup(100,cfg.standard), {credits:100, fee:5.5, payment:105.5});
});
test('Business charges 8% on credit purchases', () => {
  const r = fees.topup(100,cfg.business); assert.equal(r.fee,8); assert.equal(r.payment,108);
});
test('Inference cost ignores deposit fees', () => {
  assert.equal(fees.inferenceCost({input_usd_m:2,output_usd_m:8},1000000,300000),4.4);
});
test('BYOK under monthly allowance has zero OpenRouter fee', () => {
  assert.equal(fees.byok(100,1000,cfg.byok).fee,0);
});
test('BYOK counts only newly exceeded allowance', () => {
  const r = fees.byok(50,24980,cfg.byok);
  assert.equal(r.newExcess,30); assert.equal(r.fee,1.5); assert.equal(r.totalEstimate,51.5);
});
test('BYOK prior exceeded allowance does not double count', () => {
  assert.equal(fees.byok(100,26000,cfg.byok).fee,5);
});
test('Reject invalid prices or negative inputs', () => {
  assert.equal(fees.topup(-10,cfg.standard),null);
  assert.equal(fees.inferenceCost({input_usd_m:2,output_usd_m:8}, -1,10),null);
  assert.equal(fees.byok(10,-1,cfg.byok),null);
});
