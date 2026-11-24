'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeInputs,feeRate,estimateOnce,estimateMany,validateFx,formatUSD,formatTWD}=require('../site/estimate-core.js');
const inputs={prompt:2000,user:500,rag:3000,historyPer:500,historyCount:20,output:1000};
const q={id:'test',provider:'OpenRouter',input_usd_m:2,output_usd_m:8,cache_read_usd_m:0.2};
const other=Object.assign({},q,{provider:'OpenAI'});
const policies={providers:{OpenRouter:{standard:{credit_purchase_rate:0.055},
  business:{credit_purchase_rate:0.08}}}};
const opts={plan:'standard',policies,cache:'miss'};
function near(a,b){assert.ok(Math.abs(a-b)<1e-11,'expected '+b+', got '+a);}
test('Input formula always includes the already-filled history',()=>{
  const x=normalizeInputs(inputs);
  assert.equal(x.history,10000);assert.equal(x.input,15500);
  assert.equal(x.cachePrefix,12000);
});
test('No-cache model costs use input + output rates',()=>{
  const r=estimateOnce(other,inputs,opts);
  assert.equal(r.ok,true);near(r.total,0.039);
});
test('Standard OpenRouter applies 5.5 percent exactly once',()=>{
  const r=estimateOnce(q,inputs,opts);
  assert.equal(r.ok,true);near(r.total,0.039*1.055);
  near(r.platformFee,0.039*0.055);
});
test('Business OpenRouter applies 8 percent once',()=>{
  const r=estimateOnce(q,inputs,Object.assign({},opts,{plan:'business'}));
  near(r.total,0.039*1.08);
});
test('Ten and fifty calls are fixed multiples (not growing history)',()=>{
  const one=estimateMany(q,inputs,opts,1);
  const ten=estimateMany(q,inputs,opts,10);
  const fifty=estimateMany(q,inputs,opts,50);
  near(ten.total,one.total*10);near(fifty.total,one.total*50);
  assert.equal(fifty.inputTokens,15500*50);
});
test('Cache hit only discounts prompt and history prefix',()=>{
  const r=estimateOnce(other,inputs,Object.assign({},opts,{cache:'hit'}));
  assert.equal(r.ok,true);assert.equal(r.cacheTokens,12000);
  assert.equal(r.regularTokens,3500);
  near(r.normalInputCost,0.007);near(r.cacheReadCost,0.0024);
  near(r.outputCost,0.008);near(r.total,0.0174);
});
test('Cache hit plus OpenRouter uplift is not double marked up',()=>{
  const r=estimateOnce(q,inputs,Object.assign({},opts,{cache:'hit'}));
  near(r.total,0.0174*1.055);
});
test('Missing cache read price produces unavailable, not normal price',()=>{
  const invalid=Object.assign({},other,{cache_read_usd_m:null});
  assert.equal(estimateOnce(invalid,inputs,Object.assign({},opts,{cache:'hit'})).reason,'cache_unavailable');
});
test('No cache prefix needs no cache price',()=>{
  const empty={prompt:0,user:10,rag:0,historyPer:0,historyCount:0,output:10};
  const r=estimateOnce(Object.assign({},other,{cache_read_usd_m:null}),empty,Object.assign({},opts,{cache:'hit'}));
  assert.equal(r.ok,true);
});
test('Non-OpenRouter fees stay zero',()=>{
  near(feeRate('OpenAI','business',policies),0);
  near(estimateOnce(other,inputs,Object.assign({},opts,{plan:'business'})).total,0.039);
});
test('Fee policy unavailable blocks OpenRouter only',()=>{
  assert.equal(estimateOnce(q,inputs,{plan:'standard',policies:null,cache:'miss'}).reason,'fee_unavailable');
  assert.equal(estimateOnce(other,inputs,{plan:'standard',policies:null,cache:'miss'}).ok,true);
});
test('Negative, fractional, missing or extreme token values are rejected',()=>{
  for(const [field,value] of [['rag',-1],['output',1.25],['prompt',Number.POSITIVE_INFINITY],['historyCount',100001]]){
    const copy=Object.assign({},inputs,{[field]:value});
    assert.equal(normalizeInputs(copy),null);
  }
  assert.equal(normalizeInputs(Object.assign({},inputs,{user:undefined})),null);
});
test('FX data validates the actual date and TWD rate',()=>{
  assert.equal(validateFx({date:'2026-11-24',usd:{twd:31.3}}).rate,31.3);
  assert.equal(validateFx({rate_date:'2026-11-24',usd_twd:31.3}).rate,31.3);
  assert.equal(validateFx({date:'2026-11-24',usd:{twd:0}}),null);
});
test('Currency formatting keeps small costs visible',()=>{
  assert.notEqual(formatUSD(0.0000006),'$0.00');
  assert.notEqual(formatTWD(0.0000006,31.3),'NT$0.00');
  assert.equal(formatTWD(2,null),'NT$ —');
});
test('Missing official input/output rate cannot become a zero-cost result',()=>{
  assert.equal(estimateOnce(Object.assign({},other,{output_usd_m:null}),inputs,opts).ok,false);
});
