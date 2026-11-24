'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const core = require('../site/estimate-core.js');
function node(tag) {
  return {tag, className:'', children:[], textContent:'', attributes:{}, hidden:false,
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=[...items]},
    setAttribute(key,value){this.attributes[key]=String(value)},
    removeAttribute(key){delete this.attributes[key]},
    addEventListener(){},
    querySelectorAll(){return []}
  };
}
function context() {
  const elements=new Map();
  const document={createElement:node,getElementById(id){
    if(!elements.has(id)) elements.set(id,node('div'));
    return elements.get(id);
  }};
  const sandbox=vm.createContext({window:{CostCore:core},document,console});
  const source=fs.readFileSync(path.join(root,'site/estimate.js'),'utf8').replace(/\ninit\(\);\s*$/,'\n');
  assert.ok(!source.trimEnd().endsWith('init();'));
  vm.runInContext(source,sandbox);
  vm.runInContext("state.policies={providers:{OpenRouter:{standard:{credit_purchase_rate:0.055}}}};state.fx={rate:32.9}",sandbox);
  return sandbox;
}
const quote={provider:'OpenRouter'},other={provider:'OpenAI'};
const outcome={ok:true,total:2};
test('OpenRouter ! precedes currency sign in both USD and TWD',()=>{
  const sandbox=context();
  for (const [currency,prefix] of [['USD','$'],['TWD','NT$']]) {
    sandbox.target=node('td');sandbox.quote=quote;sandbox.outcome=outcome;
    vm.runInContext("state.currency='"+currency+"';moneyWrap(target,quote,outcome)",sandbox);
    assert.equal(sandbox.target.children.length,1,'only selected currency is rendered');
    const group=sandbox.target.children[0];
    assert.equal(group.children[0].className,'fee-info-button');
    assert.equal(group.children[0].textContent,'!');
    assert.ok(group.children[1].textContent.startsWith(prefix),group.children[1].textContent);
  }
});
test('Other providers have no ! prefix',()=>{
  const sandbox=context();sandbox.target=node('td');sandbox.quote=other;sandbox.outcome=outcome;
  vm.runInContext('moneyWrap(target,quote,outcome)',sandbox);
  assert.equal(sandbox.target.children[0].children.length,2);
  assert.equal(sandbox.target.children[0].children[0].className,'fee-info-placeholder');
  assert.ok(sandbox.target.children[0].children[1].textContent.startsWith('
});
test('Detail values follow selected currency and do not show both',()=>{
  const sandbox=context();
  let line=vm.runInContext("detailLine('一般輸入費用', 2)",sandbox);
  assert.equal(line.children.length,2);
  assert.ok(line.children[1].textContent.startsWith('$'));
  vm.runInContext("state.currency='TWD'",sandbox);
  line=vm.runInContext("detailLine('一般輸入費用', 2)",sandbox);
  assert.equal(line.children.length,2);
  assert.ok(line.children[1].textContent.startsWith('NT$'));
});
test('Missing FX never fabricates a TWD value',()=>{
  const sandbox=context();
  assert.equal(vm.runInContext("state.currency='TWD';state.fx=null;displayMoney(2)",sandbox),'NT$ —');
});
test('Currency toggle is present and defaults to USD while TWD waits for FX',()=>{
  const html=fs.readFileSync(path.join(root,'site/estimate.html'),'utf8');
  assert.match(html,/id="currencySwitch"/);
  assert.match(html,/data-currency="USD" aria-pressed="true"/);
  assert.match(html,/data-currency="TWD" aria-pressed="false" disabled/);
});
test('Original price page places ! before displayed amount',()=>{
  const app=fs.readFileSync(path.join(root,'site/app.js'),'utf8');
  const append=app.slice(app.indexOf('function appendPrice'),app.indexOf('function setupListeners'));
  assert.ok(append.indexOf('wrap.append(feeButton())') < append.indexOf('wrap.append(amount)'));
});
));
});
test('Detail values follow selected currency and do not show both',()=>{
  const sandbox=context();
  let line=vm.runInContext("detailLine('一般輸入費用', 2)",sandbox);
  assert.equal(line.children.length,2);
  assert.ok(line.children[1].textContent.startsWith('$'));
  vm.runInContext("state.currency='TWD'",sandbox);
  line=vm.runInContext("detailLine('一般輸入費用', 2)",sandbox);
  assert.equal(line.children.length,2);
  assert.ok(line.children[1].textContent.startsWith('NT$'));
});
test('Missing FX never fabricates a TWD value',()=>{
  const sandbox=context();
  assert.equal(vm.runInContext("state.currency='TWD';state.fx=null;displayMoney(2)",sandbox),'NT$ —');
});
test('Currency toggle is present and defaults to USD while TWD waits for FX',()=>{
  const html=fs.readFileSync(path.join(root,'site/estimate.html'),'utf8');
  assert.match(html,/id="currencySwitch"/);
  assert.match(html,/data-currency="USD" aria-pressed="true"/);
  assert.match(html,/data-currency="TWD" aria-pressed="false" disabled/);
});
test('Original price page places ! before displayed amount',()=>{
  const app=fs.readFileSync(path.join(root,'site/app.js'),'utf8');
  const append=app.slice(app.indexOf('function appendPrice'),app.indexOf('function setupListeners'));
  assert.ok(append.indexOf('wrap.append(feeButton())') < append.indexOf("wrap.append(el('span', '', dollars(value)))"));
});

test('Estimator numeric cells show 3 decimals and hover exposes unrounded amount',()=>{
  const sandbox=context();sandbox.target=node('td');sandbox.quote=quote;sandbox.outcome={ok:true,total:0.00045};
  vm.runInContext('moneyWrap(target,quote,outcome)',sandbox);
  const cells=sandbox.target.children[0].children;
  assert.equal(cells[1].textContent,'<$0.001');
  assert.match(cells[1].title,/0\.00045/);
});
test('Estimator TWD amount is rounded for display only',()=>{
  const sandbox=context();
  sandbox.target=node('td');sandbox.quote=other;sandbox.outcome={ok:true,total:0.0001};
  vm.runInContext("state.currency='TWD';moneyWrap(target,quote,outcome)",sandbox);
  const amount=sandbox.target.children[0].children[1];
  assert.equal(amount.textContent,'NT$0.003');
  assert.match(amount.title,/0\.00329/);
});
