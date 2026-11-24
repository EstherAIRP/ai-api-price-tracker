'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function element(tag){
 return {tag,className:'',children:[],textContent:'',title:'',attributes:{},
  append(...nodes){this.children.push(...nodes)},
  setAttribute(k,v){this.attributes[k]=String(v)},
  addEventListener(){}
 };
}
const source=fs.readFileSync(path.join(root,'site/app.js'),'utf8').replace(/\ninit\(\);\s*$/,'\n');
function context(){
 const sandbox=vm.createContext({document:{createElement:element},window:{},console});
 vm.runInContext(source,sandbox);
 return sandbox;
}
test('Original price page shows three decimals and tiny amounts clearly',()=>{
 const c=context();
 for(const [n,out] of [[0,'$0.000'],[1.5,'$1.500'],[0.012345,'$0.012'],[0.00045,'<$0.001']]){
  c.input=n;
  assert.equal(vm.runInContext('dollars(input)',c),out);
 }
});
test('OpenRouter warning leads amount; hover keeps greater precision',()=>{
 const c=context();
 c.quote={provider:'OpenRouter'};c.cell=element('td');
 vm.runInContext('appendPrice(cell,quote,0.00045)',c);
 const items=c.cell.children[0].children;
 assert.equal(items.length,2);
 assert.equal(items[0].className,'fee-info-button');
 assert.equal(items[1].textContent,'<$0.001');
 assert.match(items[1].title,/0\.00045/);
});
test('Other providers reserve icon width but display no warning',()=>{
 const c=context();
 c.quote={provider:'OpenAI'};c.cell=element('td');
 vm.runInContext('appendPrice(cell,quote,2.123456)',c);
 const items=c.cell.children[0].children;
 assert.equal(items[0].className,'fee-info-placeholder');
 assert.equal(items[0].attributes['aria-hidden'],'true');
 assert.equal(items[1].textContent,'$2.123');
 assert.match(items[1].title,/2\.123456/);
});
