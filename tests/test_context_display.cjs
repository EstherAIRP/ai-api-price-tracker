'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(root,'site/app.js'),'utf8');
function setup(){
  const sandbox=vm.createContext({window:{ApiFees:{adjustedQuote:q=>q}},document:{},console});
  vm.runInContext(original.replace(/\ninit\(\);\s*$/,'\n'),sandbox);
  return sandbox;
}
test('Context is formatted compactly with no changes to raw token count',()=>{
  const v=setup();
  for(const [n,out] of [[131072,'128K'],[200000,'200K'],[1048576,'1M'],[1000000,'1M'],[0,'—'],[null,'—'],[1234,'1,234']]){
    v.n=n;assert.equal(vm.runInContext('contextText(n)',v),out);
  }
});
test('Context sort uses full token values; missing values stay last in both directions',()=>{
  const box=setup();
  const q=[
    {id:'a',model_id:'a',provider:'OpenAI',family:'GPT',context_window_tokens:128000},
    {id:'b',model_id:'b',provider:'OpenAI',family:'GPT',context_window_tokens:null},
    {id:'c',model_id:'c',provider:'OpenAI',family:'GPT',context_window_tokens:200000},
    {id:'d',model_id:'d',provider:'OpenAI',family:'GPT',context_window_tokens:65536}
  ];
  box.q=q;
  vm.runInContext("state.quotes=q;toggleSort('context')",box);
  assert.equal(vm.runInContext("filteredQuotes().map(x=>x.id).join(',')",box),'d,a,c,b');
  vm.runInContext("toggleSort('context')",box);
  assert.equal(vm.runInContext("filteredQuotes().map(x=>x.id).join(',')",box),'c,a,d,b');
  assert.equal(vm.runInContext("toggleSort('total')",box),false);
});
test('Overview order matches requested context, input and output on desktop and mobile',()=>{
  const html=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
  const desktop=[...html.matchAll(/<th[^>]*data-sort-header="([^"]+)"/g)].map(x=>x[1]);
  const mobile=[...html.matchAll(/class="mobile-sort-item" data-sort-header="([^"]+)"/g)].map(x=>x[1]);
  const expected=['model','provider','context','input','output','source'];
  assert.deepEqual(desktop,expected);
  assert.deepEqual(mobile,expected);
  assert.doesNotMatch(html,/data-sort="total"/);
});
test('The separate cost estimator retains 1, 10 and 50-call comparison',()=>{
  const html=fs.readFileSync(path.join(root,'site/estimate.html'),'utf8');
  for(const key of ['cost1','cost10','cost50'])assert.match(html,new RegExp('data-sort="'+key+'"'));
});
