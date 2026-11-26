'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'site/style.css'),'utf8');
const theme=css.slice(css.indexOf('API ATLAS • ICE BLUE + PASTEL JOURNAL'));
test('Pastel design system exists in the shared stylesheet',()=>{
  assert.ok(theme.length>4000);
  for(const token of ['--ink:#33424d','--bg:#f8fbfc','--ice:#8fc9d8',
    '--lavender:#d9c7f2','--lavender-soft:#f3eefb','--teal:#3e7f92']){
    assert.ok(theme.includes(token),token);
  }
});
test('Both pages retain their existing functional scripts and use the same themed CSS',()=>{
  for(const [htmlName,jsName] of [['index.html','app.js'],['estimate.html','estimate.js']]){
    const html=fs.readFileSync(path.join(root,'site',htmlName),'utf8');
    assert.match(html,/name="theme-color" content="#f8fbfc"/);
    assert.match(html,/<link rel="stylesheet" href="\.\/style\.css"/);
    assert.ok(html.includes('<script src="./'+jsName+'" defer>'));
    assert.match(html,/id="price(s|Table)"|id="estimateTable"/);
  }
});
test('Main interface components and estimate inputs receive the theme on desktop and mobile',()=>{
  const required=['.topbar','.top-nav','.brand-icon','.hero','.stat-card',
    '.chip','.billing-switch','.billing-option','.search','.select-wrap',
    '.context-value','.fee-info-button','.fee-popover','.scenario-grid label',
    '.scenario-summary','.estimate-round-item','#priceTable tbody tr.quote-row',
    '#estimateTable tbody tr.quote-row','.mobile-sort-item','.mobile-load-more:not([hidden])'];
  for(const selector of required)assert.ok(theme.includes(selector),selector);
  assert.match(theme,/@media\(max-width:750px\)/);
  assert.match(theme,/@media\(max-width:360px\)/);
});
test('Important controls stay visible and accessible, with reduced-motion support',()=>{
  assert.match(theme,/color:#2d6478/);
  assert.match(theme,/\.search:focus-within/);
  assert.match(theme,/\.scenario-grid input:focus/);
  assert.match(theme,/focus-visible/);
  assert.match(theme,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(theme,/#priceTable\s*\{\s*display:none/);
  assert.doesNotMatch(theme,/#estimateTable\s*\{\s*display:none/);
});
test('Theme stylesheet has balanced CSS blocks and complete quoted strings',()=>{
  let depth=0,quoted=null,escape=false,comment=false;
  for(let i=0;i<css.length;i++){
    const c=css[i],n=css[i+1];
    if(comment){if(c==='*'&&n==='/'){comment=false;i++;}continue;}
    if(quoted){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quoted)quoted=null;continue;}
    if(c==='/'&&n==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quoted=c;continue;}
    if(c==='{')depth++;
    if(c==='}')depth--;
    assert.ok(depth>=0,'Unexpected closing brace at character '+i);
  }
  assert.equal(depth,0,'Unclosed CSS rules');
  assert.equal(comment,false);
  assert.equal(quoted,null);
});
