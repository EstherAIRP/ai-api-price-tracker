'use strict';

const $ = id => document.getElementById(id);
const core = window.CostCore;
const state = {quotes:[], policies:null, fx:null, family:'all', search:'', provider:'all',
  plan:'standard', cache:'miss', currency:'USD', sort:'cost1', sortDir:'asc', mobileShown:24, selected:null, published:null};
const ids = {prompt:'promptTokens', user:'userTokens', rag:'ragTokens',
  output:'outputTokens', historyPer:'historyPerTokens', historyCount:'historyCount'};
let activeTooltip = null;
let pinnedTooltip = false;

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function safeLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : '#';
  } catch { return '#'; }
}
function readInputs() {
  const result = {};
  for (const [key,id] of Object.entries(ids)) {
    const raw = $(id).value;
    if (raw.trim() === '') return null;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    result[key] = n;
  }
  return core.normalizeInputs(result) ? result : null;
}
function quoteCost(quote, inputs, n) {
  if (!inputs) return {ok:false,reason:'invalid'};
  return core.estimateMany(quote, inputs, {
    plan:state.plan, policies:state.policies, cache:state.cache
  }, n);
}
function displayMoney(usd) {
  return state.currency === 'TWD'
    ? core.formatTWD(usd, state.fx && state.fx.rate)
    : core.formatUSD(usd);
}
function exactMoney(usd) {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) return '金額資料無效';
  if (state.currency === 'TWD') {
    const rate = state.fx && state.fx.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return '臺幣匯率未載入';
    return '未四捨五入：TWD NT$' + Number((usd * rate).toPrecision(12)).toString();
  }
  return '未四捨五入：USD $' + Number(usd.toPrecision(12)).toString();
}
function moneyWrap(cell, quote, outcome) {
  if (!outcome.ok) {
    const msg = outcome.reason === 'cache_unavailable' ? '沒有公開快取讀取報價' :
      outcome.reason === 'fee_unavailable' ? '平台費率資料缺失' : '無法估算';
    cell.append(el('span','estimate-unsupported','—'));
    const detail = el('small','estimate-muted',msg);
    detail.title = msg;
    cell.append(detail);
    return;
  }
  const line = el('span','price-with-info estimate-money');
  if (quote.provider === 'OpenRouter') {
    line.append(feeButton());
  } else {
    const slot=el('span','fee-info-placeholder');
    slot.setAttribute('aria-hidden','true');
    line.append(slot);
  }
  const amount=el('span','money-number',displayMoney(outcome.total));
  amount.title=exactMoney(outcome.total);
  line.append(amount);
  cell.append(line);
}
function hideTooltip() {
  const bubble = $('feePopover');
  if (bubble) bubble.hidden = true;
  if (activeTooltip) activeTooltip.setAttribute('aria-expanded','false');
  activeTooltip = null;
  pinnedTooltip = false;
}
function showTooltip(button, pin) {
  const bubble = $('feePopover');
  if (activeTooltip && activeTooltip !== button) activeTooltip.setAttribute('aria-expanded','false');
  const pct = core.feeRate('OpenRouter',state.plan,state.policies);
  const value = pct === null ? '尚無平台費率' : '已含平台費用（' + (pct*100).toFixed(1).replace(/\.0$/,'') + '%）';
  bubble.replaceChildren(
    el('strong','',value),
    el('span','','依購買點數手續費攤提的比較參考價；非每次推論加收。Standard 小額儲值可能受 $0.80 最低手續費影響。')
  );
  bubble.hidden = false;
  const rect = button.getBoundingClientRect();
  const left = Math.max(10,Math.min(window.innerWidth-bubble.offsetWidth-10,
    rect.left+rect.width/2-bubble.offsetWidth/2));
  const top = rect.bottom+bubble.offsetHeight+12>window.innerHeight && rect.top>bubble.offsetHeight+12
    ? rect.top-bubble.offsetHeight-8 : rect.bottom+8;
  bubble.style.left = left + 'px';
  bubble.style.top = top + 'px';
  activeTooltip = button;
  pinnedTooltip = pin;
  button.setAttribute('aria-expanded',String(pin));
}
function feeButton() {
  const button = el('button','fee-info-button','!');
  button.type='button';
  const pct = core.feeRate('OpenRouter',state.plan,state.policies);
  button.setAttribute('aria-label','查看已含平台費用（'+(pct===null?'費率未知':(pct*100).toFixed(1)+'%')+'）說明');
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls','feePopover');
  button.addEventListener('mouseenter',()=>{ if (!pinnedTooltip) showTooltip(button,false); });
  button.addEventListener('mouseleave',()=>{ if (!pinnedTooltip) hideTooltip(); });
  button.addEventListener('focus',()=>{ if (!pinnedTooltip) showTooltip(button,false); });
  button.addEventListener('blur',()=>{ if (!pinnedTooltip) hideTooltip(); });
  button.addEventListener('click',event=>{
    event.stopPropagation();
    if (pinnedTooltip && activeTooltip===button) hideTooltip();
    else showTooltip(button,true);
  });
  return button;
}
function setChoice(group, selector, value, field) {
  state[field] = value;
  state.mobileShown = 24;
  for (const button of $(group).querySelectorAll(selector)) {
    const active = button.dataset[field] === value;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  hideTooltip();
  render();
}
function setupListeners() {
  for(const id of Object.values(ids)) $(id).addEventListener('input',render);
  $('families').addEventListener('click',event=>{
    const button = event.target.closest('[data-family]');
    if (button) setChoice('families','[data-family]',button.dataset.family,'family');
  });
  $('billingSwitch').addEventListener('click',event=>{
    const button = event.target.closest('[data-plan]');
    if (button) setChoice('billingSwitch','[data-plan]',button.dataset.plan,'plan');
  });
  $('cacheSwitch').addEventListener('click',event=>{
    const button = event.target.closest('[data-cache]');
    if (button) setChoice('cacheSwitch','[data-cache]',button.dataset.cache,'cache');
  });
  $('currencySwitch').addEventListener('click',event=>{
    const button = event.target.closest('[data-currency]:not(:disabled)');
    if (button) setChoice('currencySwitch','[data-currency]',button.dataset.currency,'currency');
  });
  $('search').addEventListener('input',event=>{state.search=event.target.value.trim().toLowerCase();state.mobileShown=24;render();});
  $('provider').addEventListener('change',event=>{state.provider=event.target.value;state.mobileShown=24;render();});
  $('prices').addEventListener('click',event=>{
    const button=event.target.closest('button[data-sort]');
    if(button && toggleSort(button.dataset.sort)) render();
  });
  $('estimateMore').addEventListener('click',()=>{state.mobileShown+=24;render();});
  window.matchMedia('(max-width:750px)').addEventListener('change',render);
  document.addEventListener('click',event=>{
    if (activeTooltip && !event.target.closest('.fee-info-button')) hideTooltip();
  });
  document.addEventListener('keydown',event=>{ if(event.key==='Escape')hideTooltip(); });
  window.addEventListener('scroll',hideTooltip,{passive:true});
  window.addEventListener('resize',hideTooltip,{passive:true});
}
const ESTIMATE_SORT_KEYS=['model','provider','cost1','cost10','cost50','source'];
function toggleSort(key){
  if(!ESTIMATE_SORT_KEYS.includes(key))return false;
  state.mobileShown=24;
  if(state.sort===key)state.sortDir=state.sortDir==='asc'?'desc':'asc';
  else {state.sort=key;state.sortDir='asc';}
  return true;
}
function updateSortHeaders(){
  for(const header of document.querySelectorAll('#estimateTable th[data-sort-header], #prices .mobile-sort-item[data-sort-header]')){
    const active=header.dataset.sortHeader===state.sort;
    const mobile=header.tagName==='BUTTON';
    if(mobile)header.setAttribute('aria-pressed',String(active));
    else header.setAttribute('aria-sort',active?(state.sortDir==='asc'?'ascending':'descending'):'none');
    const indicator=header.querySelector('.sort-indicator');
    if(indicator)indicator.textContent=active?(state.sortDir==='asc'?'↑':'↓'):'↕';
    const button=mobile?header:header.querySelector('button[data-sort]');
    if(button)button.title=active
      ?'目前'+(state.sortDir==='asc'?'升序':'降序')+'，點擊改為'+(state.sortDir==='asc'?'降序':'升序')
      :'點擊依此欄升序排列';
  }
}
function sourceName(q){
  return q.status==='stale'?'前次有效值'
    :q.verification==='provider_api'?'平台 API':'社群彙整';
}
function visibleQuotes(inputs){
  const list=state.quotes.filter(q=>{
    if(state.family!=='all' && state.family!==q.family)return false;
    if(state.provider!=='all' && state.provider!==q.provider)return false;
    return (String(q.model_id)+' '+String(q.model_name)+' '+String(q.provider)).toLowerCase().includes(state.search);
  });
  const direction=state.sortDir==='desc'?-1:1;
  const tie=(a,b)=>a.model_id.localeCompare(b.model_id)||a.provider.localeCompare(b.provider);
  const calls={cost1:1,cost10:10,cost50:50}[state.sort];
  const amounts=new Map();
  const cost=q=>{
    if(!amounts.has(q.id)){
      const result=quoteCost(q,inputs,calls);
      amounts.set(q.id,result.ok?result.total:null);
    }
    return amounts.get(q.id);
  };
  list.sort((a,b)=>{
    if(calls){
      const av=cost(a),bv=cost(b);
      if(av===null && bv!==null)return 1;
      if(bv===null && av!==null)return -1;
      if(av!==null && bv!==null && av!==bv)return (av-bv)*direction;
    }else if(state.sort==='provider'){
      const c=a.provider.localeCompare(b.provider);
      if(c)return c*direction;
    }else if(state.sort==='source'){
      const c=sourceName(a).localeCompare(sourceName(b));
      if(c)return c*direction;
    }else if(state.sort==='model'){
      const c=a.model_id.localeCompare(b.model_id);
      if(c)return c*direction;
    }
    return tie(a,b);
  });
  return list;
}
function renderSummary(inputs) {
  const normalized = core.normalizeInputs(inputs);
  $('inputError').hidden = !!normalized;
  $('inputTotal').textContent = normalized ? normalized.input.toLocaleString('zh-TW') : '—';
  $('outputTotal').textContent = normalized ? normalized.output.toLocaleString('zh-TW') : '—';
  $('cacheTotal').textContent = normalized ? normalized.cachePrefix.toLocaleString('zh-TW') : '—';
}
function renderTable(inputs) {
  updateSortHeaders();
  hideTooltip();
  const tbody=$('estimateRows');
  tbody.replaceChildren();
  const visible=visibleQuotes(inputs);
  const mobile=window.matchMedia('(max-width:750px)').matches;
  const shown=mobile?visible.slice(0,state.mobileShown):visible;
  $('estimateMore').hidden=!mobile || shown.length>=visible.length;
  const fragment=document.createDocumentFragment();
  for(const q of shown){
    const row=el('tr','quote-row'+(state.selected===q.id?' selected':''));
    row.tabIndex=0;
    row.setAttribute('aria-label','查看 '+q.model_id+' 在 '+q.provider+' 的費用明細');
    const model=el('td','model-cell');
    model.append(el('strong','',q.model_id),el('small','',q.family));
    const provider=el('td','provider-cell',q.provider);
    provider.append(el('span','type-tag',q.provider_type==='official_channel'?'官方通路＊':'第三方'));
    row.append(model,provider);
    for(const n of [1,10,50]){
      const cost=quoteCost(q,inputs,n);
      const td=el('td','num estimate-cost');
      td.setAttribute('data-label',n+' 次');
      moneyWrap(td,q,cost);
      row.append(td);
    }
    const source=el('td','source-cell');
    source.setAttribute('data-label','資料來源');
    source.append(el('span','source-tag'+(q.verification==='provider_api'?' direct':'')+
      (q.status!=='current'?' stale':''),
      q.status==='stale'?'前次有效值':q.verification==='provider_api'?'平台 API':'社群彙整'));
    row.append(source,el('td','open-arrow','↗'));
    const choose=()=>{
      state.selected=q.id;
      renderTable(inputs);
      renderDetail(inputs);
      if(window.matchMedia('(max-width:750px)').matches) $('comparison').scrollIntoView({behavior:'smooth'});
    };
    row.addEventListener('click',event=>{ if (!event.target.closest('.fee-info-button')) choose(); });
    row.addEventListener('keydown',event=>{
      if(event.target===row && (event.key==='Enter'||event.key===' ')){event.preventDefault();choose();}
    });
    fragment.append(row);
  }
  tbody.append(fragment);
  $('shownCount').textContent=visible.length.toLocaleString('zh-TW')+' 筆報價'+(mobile && visible.length?' · 已顯示 '+shown.length.toLocaleString('zh-TW')+' 筆':'');
  $('emptyState').hidden=visible.length>0;
  if(!visible.length){
    $('emptyTitle').textContent=state.quotes.length?'沒有符合條件的價格':'尚無資料';
    $('emptyText').textContent='請調整搜尋、模型系列或平台篩選。';
  }
}
function detailLine(label, usd) {
  const row=el('div','estimate-detail-line');
  const amount=el('strong','money-number',displayMoney(usd));
  amount.title=exactMoney(usd);
  row.append(el('span','',label),amount);
  return row;
}
function renderDetail(inputs) {
  const chosen=state.quotes.find(q=>q.id===state.selected);
  const body=$('costDetail'), peers=$('peerDetail');
  body.className='';
  peers.className='';
  body.replaceChildren();
  peers.replaceChildren();
  if(!chosen){body.append(el('p','subtle','請先選擇模型'));return;}
  const heading=el('div','details-header');
  const title=el('div');
  title.append(el('strong','',chosen.model_id),el('span','',chosen.provider+' · '+(state.cache==='hit'?'預熱 Cache 命中':'未命中 Cache')));
  const source=el('a','official-link','核對報價來源 ↗');
  source.href=safeLink(chosen.source_url);source.target='_blank';source.rel='noopener noreferrer';
  heading.append(title,source);body.append(heading);
  const one=quoteCost(chosen,inputs,1);
  if(!one.ok){
    body.append(el('p','estimate-warning',one.reason==='cache_unavailable'
      ? '這個平台沒有有效的快取讀取報價，因此無法可靠估算命中成本。請切換「未命中」。'
      : '缺少有效價格、平台費率或輸入條件，無法計算。'));
  }else{
    const list=el('div','estimate-breakdown');
    list.append(detailLine('一般輸入費用（'+one.regularTokens.toLocaleString()+' Token）',one.normalInputCost));
    list.append(detailLine('Cache 讀取費用（'+one.cacheTokens.toLocaleString()+' Token）',one.cacheReadCost));
    list.append(detailLine('模型輸出費用（'+one.outputTokens.toLocaleString()+' Token）',one.outputCost));
    if (chosen.provider==='OpenRouter') list.append(detailLine('OpenRouter 儲值費攤提（'+
      (one.rate*100).toFixed(1)+'%）',one.platformFee));
    list.append(el('div','estimate-detail-total','單次預估總費用'));
    list.append(detailLine('總計',one.total));
    body.append(list);
    const totals=el('div','estimate-round-summary');
    for(const n of [1,10,50]){
      const box=el('div','estimate-round-item');
      const amount=el('strong','money-number',displayMoney(one.total*n));
      amount.title=exactMoney(one.total*n);
      box.append(el('span','',n+' 次'),amount);
      totals.append(box);
    }
    body.append(totals);
  }
  const matches=state.quotes.filter(q=>q.model_id===chosen.model_id).sort((a,b)=>{
    const aa=quoteCost(a,inputs,1),bb=quoteCost(b,inputs,1);
    return (aa.ok?aa.total:Infinity)-(bb.ok?bb.total:Infinity);
  });
  const table=el('table','mini-table estimate-peers');
  const head=el('thead'),hr=el('tr');
  for(const label of ['平台','1 次','10 次','50 次'])hr.append(el('th','',label));
  head.append(hr);table.append(head);
  const rows=el('tbody');
  for(const q of matches){
    const tr=el('tr',q.id===chosen.id?'selected':'');
    const peerProvider=el('td','',q.provider);
    peerProvider.setAttribute('data-label','平台');
    tr.append(peerProvider);
    for(const n of [1,10,50]){
      const r=quoteCost(q,inputs,n);
      const costCell=el('td','estimate-peer-price');
      costCell.setAttribute('data-label',n+' 次');
      moneyWrap(costCell,q,r);
      tr.append(costCell);
    }
    rows.append(tr);
  }
  table.append(rows);
  peers.append(table,el('p','source-note','只比對完全相同的模型 ID；平台未提供該模型時不會製造報價。'));
}
function render() {
  if (!core || typeof core.estimateMany!=='function') return;
  const inputs=readInputs();
  renderSummary(inputs);
  renderTable(inputs);
  renderDetail(inputs);
}
async function fetchJson(url) {
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok) throw new Error('HTTP '+response.status);
  return response.json();
}
async function loadFx() {
  // The first available source wins; never invent an exchange rate.
  const urls=[
    './data/fx-rate.json',
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
  ];
  for(const url of urls){
    try{
      const data=await fetchJson(url);
      const fx=core.validateFx(data);
      if(!fx)continue;
      // Reject very old static snapshots and try a live reference rate instead.
      const ageMs = Date.now() - new Date(fx.date+'T00:00:00Z').getTime();
      if (url.startsWith('./') && (!Number.isFinite(ageMs) || ageMs > 7 * 86400000)) continue;
      state.fx=Object.assign({},fx,{source:fx.source||url});
      $('currencyTWD').disabled=false;
      $('currencyTWD').removeAttribute('title');
      $('statFX').textContent=fx.rate.toFixed(3);
      $('fxStamp').textContent='1 USD ≈ '+fx.rate.toFixed(3)+' TWD · '+fx.date;
      $('rateFooter').textContent='1 USD ≈ '+fx.rate.toFixed(4)+' TWD（'+fx.date+'）· 僅供參考，不含匯差、稅及未建檔的平台費';
      render();
      return;
    }catch(error){console.warn('FX source not available:',url,error);}
  }
  $('statFX').textContent='—';
  $('fxStamp').textContent='匯率來源暫時無法取得';
  $('rateFooter').textContent='臺幣換算暫無可用匯率；美金估算仍可正常使用。';
}
async function init() {
  setupListeners();
  renderSummary(readInputs());
  try{
    const result=await Promise.all([
      fetchJson('./data/prices.json'),
      fetchJson('./data/provider-fees.json')
    ]);
    const catalog=result[0],policies=result[1];
    if(!Array.isArray(catalog.quotes)||!catalog.quotes.length)
      throw new Error('模型價目表缺失或內容為空');
    if(!policies || !policies.providers || !policies.providers.OpenRouter)
      throw new Error('OpenRouter 方案資料缺失');
    state.quotes=catalog.quotes;
    state.policies=policies;
    state.published=catalog.published_at;
    $('statModels').textContent=new Set(state.quotes.map(q=>q.model_id)).size.toLocaleString('zh-TW');
    $('statQuotes').textContent=state.quotes.length.toLocaleString('zh-TW');
    $('statProviders').textContent=new Set(state.quotes.map(q=>q.provider)).size.toLocaleString('zh-TW');
    $('snapshotTime').textContent='價目表最後更新：'+(catalog.published_at ?
      new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',
        day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(catalog.published_at)) : '未知');
    for(const provider of [...new Set(state.quotes.map(q=>q.provider))].sort()){
      const option=el('option','',provider);option.value=provider;$('provider').append(option);
    }
    state.selected=state.quotes.find(q=>q.family==='GPT')?.id||state.quotes[0].id;
    $('loadNotice').hidden=true;
    render();
  }catch(error){
    console.warn('Unable to read model prices:',error);
    $('loadNotice').hidden=false;
    $('loadNotice').textContent='價目表讀取失敗：'+error.message+'。請稍後重新整理。';
    $('shownCount').textContent='價格資料尚未載入';
    $('emptyState').hidden=false;
    $('emptyTitle').textContent='無法取得價格資料';
    $('emptyText').textContent='這不代表 0 筆報價，請確認 GitHub Pages 已同步最新資料。';
  }
  // USD estimates do not depend on the availability of an FX provider.
  loadFx();
}
init();
