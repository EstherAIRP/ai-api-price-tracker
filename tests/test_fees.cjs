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

test('OpenRouter Standard prices are 1.055x without changing source catalog', () => {
  const q = {provider:'OpenRouter', input_usd_m:2, output_usd_m:10};
  const shown = fees.adjustedQuote(q,'standard',policy);
  assert.ok(Math.abs(shown.input_usd_m-2.11)<1e-12);
  assert.ok(Math.abs(shown.output_usd_m-10.55)<1e-12);
  assert.equal(q.input_usd_m,2);
  assert.equal(q.output_usd_m,10);
});
test('OpenRouter Business prices are 1.08x, including calculator values', () => {
  const q = {provider:'OpenRouter', input_usd_m:2, output_usd_m:10};
  const shown = fees.adjustedQuote(q,'business',policy);
  assert.equal(shown.input_usd_m,2.16);
  assert.equal(shown.output_usd_m,10.8);
  assert.ok(Math.abs(fees.inferenceCost(shown,1000000,1000000)-12.96)<1e-12);
});
test('Other providers are unaffected by plan switch', () => {
  const q = {provider:'OpenAI', input_usd_m:3, output_usd_m:9};
  assert.deepEqual(fees.adjustedQuote(q,'business',policy),q);
});
test('Missing fee policy or unsupported plan never silently shows unadjusted OpenRouter price', () => {
  const q = {provider:'OpenRouter', input_usd_m:2, output_usd_m:10};
  assert.equal(fees.adjustedQuote(q,'byok',policy),null);
  assert.equal(fees.adjustedQuote(q,'standard',null),null);
});
