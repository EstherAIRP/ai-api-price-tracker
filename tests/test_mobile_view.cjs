'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fakeElement(tag='div'){
  return {tagName:tag.toUpperCase(),children:[],className:'',dataset:{},attributes:{},
    textContent:'',hidden:false,value:'',title:'',style:{},
    append(...v){this.children.push(...v)},
    appendChild(v){this.children.push(v)},
    replaceChildren(...v){this.children=[...v]},
    setAttribute(k,v){this.attributes[k]=String(v)},
    addEventListener(){},
    querySelectorAll(){return []},
    querySelector(){return null}
  };
}
function harness(page,mobile=true){
  const elements=new Map();
  const doc={
    getElementById(id){
      if(!elements.has(id))elements.set(id,fakeElement());
      return elements.get(id);
    },
    createElement:fakeElement,
    createDocumentFragment(){return fakeElement('fragment')},
    querySelectorAll(){return []}
  };
  const win={
    matchMedia(){return {matches:mobile,addEventListener(){}}},
    ApiFees:require('../site/fees.js'),
    CostCore:require('../site/estimate-core.js')
  };
  const box=vm.createContext({window:win,document:doc,console});
  const code=fs.readFileSync(path.join(root,'site',page),'utf8').replace(/\ninit\(\);\s*$/,'\n');
  vm.runInContext(code,box);
  const quotes=Array.from({length:53},(_,i)=>({
    id:'test-'+String(i).padStart(3,'0'), model_id:'test/model-'+String(i).padStart(3,'0'),
    model_name:'Test', family:'GPT',provider:'OpenAI',provider_type:'official_channel',
    input_usd_m:i+0.25,output_usd_m:2,verification:'provider_api',status:'current'
  }));
  box.quotes=quotes;
  vm.runInContext('state.quotes=quotes',box);
  return {box,doc,elements};
}
test('Both mobile main catalogs show only 24 rows initially and reveal more in batches',()=>{
  for(const [script,table,button] of [
    ['app.js','priceRows','priceMore'],
    ['estimate.js','estimateRows','estimateMore']
  ]){
    const {box,doc}=harness(script);
    const command=script==='app.js'?'renderTable()':"renderTable({prompt:500,user:100,rag:100,historyPer:100,historyCount:1,output:100})";
    vm.runInContext(command,box);
    assert.equal(doc.getElementById(table).children[0].children.length,24,script);
    assert.equal(doc.getElementById(button).hidden,false);
    assert.match(doc.getElementById('shownCount').textContent,/已顯示 24 筆/);
    vm.runInContext('state.mobileShown+=24;'+command,box);
    assert.equal(doc.getElementById(table).children[0].children.length,48);
    vm.runInContext('state.mobileShown+=24;'+command,box);
    assert.equal(doc.getElementById(table).children[0].children.length,53);
    assert.equal(doc.getElementById(button).hidden,true);
  }
});
test('Desktop rendering keeps all rows and never exposes the load-more button',()=>{
  for(const [script,table,button] of [
    ['app.js','priceRows','priceMore'],
    ['estimate.js','estimateRows','estimateMore']
  ]){
    const {box,doc}=harness(script,false);
    const command=script==='app.js'?'renderTable()':"renderTable({prompt:500,user:100,rag:100,historyPer:100,historyCount:1,output:100})";
    vm.runInContext(command,box);
    assert.equal(doc.getElementById(table).children[0].children.length,53);
    assert.equal(doc.getElementById(button).hidden,true);
  }
});
test('Mobile cards retain individual price labels and source labels',()=>{
  const a=harness('app.js');
  vm.runInContext('renderTable()',a.box);
  const row=a.doc.getElementById('priceRows').children[0].children[0];
  assert.equal(row.children[2].attributes['data-label'],'上下文限制');
  assert.equal(row.children[3].attributes['data-label'],'輸入 / 百萬');
  assert.equal(row.children[4].attributes['data-label'],'輸出 / 百萬');
  assert.equal(row.children[5].attributes['data-label'],'資料來源');
  const e=harness('estimate.js');
  vm.runInContext("renderTable({prompt:1,user:1,rag:1,historyPer:1,historyCount:1,output:1})",e.box);
  const result=e.doc.getElementById('estimateRows').children[0].children[0];
  assert.deepEqual(result.children.slice(2,5).map(c=>c.attributes['data-label']),['1 次','10 次','50 次']);
});
test('Mobile sort controls exist for both catalogs and no menu or desktop sort is removed',()=>{
  for(const [page,keys] of [
    ['index.html',['model','provider','context','input','output','source']],
    ['estimate.html',['model','provider','cost1','cost10','cost50','source']]
  ]){
    const html=fs.readFileSync(path.join(root,'site',page),'utf8');
    assert.match(html,/class="mobile-sort-bar"/);
    assert.equal([...html.matchAll(/class="mobile-sort-item"/g)].length,6);
    assert.equal([...html.matchAll(/data-sort-header=/g)].length,12);
    for(const key of keys)assert.match(html,new RegExp('class="mobile-sort-item" data-sort-header="'+key+'"'));
    assert.match(html,/class="sort-button"/);
  }
});
test('Two pages share a responsive card style, navigation, input sizes and load-more UI',()=>{
  const css=fs.readFileSync(path.join(root,'site/style.css'),'utf8');
  for(const selector of ['#priceTable tbody tr.quote-row','#estimateTable tbody tr.quote-row',
    '.mobile-sort-bar','.mobile-load-more:not([hidden])','.topbar .top-nav',
    '.scenario-grid input','.scenario-summary']){
    assert.ok(css.includes(selector),selector);
  }
  assert.match(css,/@media\(max-width:750px\)/);
});
