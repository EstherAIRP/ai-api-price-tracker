'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sample=[
{id:'a',model_id:'z/model',model_name:'Z',provider:'OpenAI',input_usd_m:8,output_usd_m:2,verification:'provider_api',status:'current'},
{id:'b',model_id:'a/model',model_name:'A',provider:'OpenRouter',input_usd_m:1,output_usd_m:4,verification:'provider_api',status:'current'},
{id:'c',model_id:'b/model',model_name:'B',provider:'Anthropic',input_usd_m:3,output_usd_m:1,verification:'models_dev',status:'current'},
{id:'d',model_id:'q/model',model_name:'Q',provider:'Other',input_usd_m:null,output_usd_m:2,verification:'models_dev',status:'current'},
];
function context(file){
  const source=fs.readFileSync(path.join(root,'site',file),'utf8');
  assert.match(source,/\ninit\(\);\s*$/);
  const headers=[];
  const doc={
    querySelectorAll(selector){return headers},
    getElementById(){return null},
    createElement(){return {}}
  };
  const win={
    ApiFees:{adjustedQuote:q=>q},
    CostCore:{
      estimateMany(q,inputs,options,n){
        return typeof q.input_usd_m==='number'
          ? {ok:true,total:q.input_usd_m*n}:{ok:false,reason:'invalid'};
      }
    }
  };
  const box=vm.createContext({window:win,document:doc,console});
  vm.runInContext(source.replace(/\ninit\(\);\s*$/,'\n'),box);
  box.sample=sample;
  vm.runInContext('state.quotes=sample',box);
  return {box,headers};
}
function names(box,expression){return vm.runInContext(expression,box).join(',');}
function makeHeader(key){
  const symbol={textContent:''};
  const button={title:''};
  return {
    dataset:{sortHeader:key},attrs:{},
    setAttribute(k,v){this.attrs[k]=v},
    querySelector(selector){return selector==='.sort-indicator'?symbol:button},
    symbol,button
  };
}
for(const [file,func,column] of [
 ['app.js','filteredQuotes()','input'],
 ['estimate.js','visibleQuotes({})','cost10']
]){
  test(file+' toggles numeric column ascending / descending',()=>{
    const {box}=context(file);
    box.column=column;
    assert.equal(vm.runInContext('toggleSort(column)',box),true);
    assert.equal(names(box,func+'.map(q=>q.id)'), 'b,c,a,d');
    assert.equal(vm.runInContext('toggleSort(column)',box),true);
    assert.equal(names(box,func+'.map(q=>q.id)'), 'a,c,b,d');
    assert.equal(vm.runInContext('state.sortDir',box),'desc');
    assert.equal(vm.runInContext("toggleSort('not-a-column')",box),false);
  });
  test(file+' sorts provider names and model names, keeping ties stable',()=>{
    const {box}=context(file);
    vm.runInContext("toggleSort('provider')",box);
    assert.equal(names(box,func+'.map(q=>q.id)'), 'c,a,b,d');
    vm.runInContext("toggleSort('model')",box);
    assert.equal(names(box,func+'.map(q=>q.id)'), 'b,c,d,a');
    vm.runInContext("toggleSort('model')",box);
    assert.equal(names(box,func+'.map(q=>q.id)'), 'a,d,c,b');
  });
  test(file+' updates aria-sort and arrows on column headings',()=>{
    const {box,headers}=context(file);
    const one=makeHeader(column),two=makeHeader('model');
    headers.push(one,two);
    box.column=column;
    vm.runInContext('toggleSort(column);updateSortHeaders()',box);
    assert.equal(one.attrs['aria-sort'],'ascending');
    assert.equal(one.symbol.textContent,'↑');
    assert.equal(two.attrs['aria-sort'],'none');
    assert.equal(two.symbol.textContent,'↕');
    vm.runInContext('toggleSort(column);updateSortHeaders()',box);
    assert.equal(one.attrs['aria-sort'],'descending');
    assert.equal(one.symbol.textContent,'↓');
  });
}
test('Both main tables have six clickable columns, and no standalone sort dropdown',()=>{
  for(const [file,keys] of [
   ['index.html',['model','provider','context','input','output','source']],
   ['estimate.html',['model','provider','cost1','cost10','cost50','source']]
  ]){
    const html=fs.readFileSync(path.join(root,'site',file),'utf8');
    const found=[...html.matchAll(/<th[^>]*data-sort-header="([^"]+)"/g)].map(x=>x[1]);
    assert.deepEqual(found,keys);
    for(const key of keys){
      assert.match(html,new RegExp('class="sort-button" data-sort="'+key+'"'));
    }
    assert.doesNotMatch(html,/<select id="sort"/);
  }
});
