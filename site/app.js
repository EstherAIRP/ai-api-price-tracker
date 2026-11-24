'use strict';

const state = {
  quotes: [], history: [], family: 'all', search: '', provider: 'all',
  sort: 'model', selectedQuoteId: null, feePolicies: null, plan: 'standard',
};
const $ = id => document.getElementById(id);
const dollars = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  const digits = value < 0.001 ? 7 : value < 0.1 ? 5 : value < 1 ? 4 : 2;
  return '$' + value.toLocaleString('en-US', {maximumFractionDigits: digits});
};
const money = value => typeof value === 'number' && Number.isFinite(value) && (value >= 0.01 || value === 0)
  ? '$' + value.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : dollars(value);
const formatStamp = value => value ? new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value)) : '未發布';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function safeLink(url) {
  try {
    const checked = new URL(url);
    return checked.protocol === 'https:' ? checked.href : '#';
  } catch { return '#'; }
}

function currentFeeRate() {
  const rate = state.feePolicies?.providers?.OpenRouter?.[state.plan]?.credit_purchase_rate;
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : null;
}
function quoteWithFees(q) {
  return window.ApiFees.adjustedQuote(q, state.plan, state.feePolicies);
}
function priceValue(q, key) {
  const shown = quoteWithFees(q);
  return shown ? (key === 'total' ? shown.input_usd_m + shown.output_usd_m : shown[key]) : null;
}
let activeFeeButton = null;
let feePopoverPinned = false;
function hideFeePopover() {
  const popover = $('feePopover');
  if (popover) popover.hidden = true;
  if (activeFeeButton) activeFeeButton.setAttribute('aria-expanded', 'false');
  activeFeeButton = null;
  feePopoverPinned = false;
}
function showFeePopover(button, pinned = false) {
  const tooltip = $('feePopover');
  if (!tooltip) return;
  if (activeFeeButton && activeFeeButton !== button) activeFeeButton.setAttribute('aria-expanded', 'false');
  const rate = currentFeeRate();
  const pct = rate === null ? null : (rate * 100).toFixed(1).replace(/\.0$/, '');
  tooltip.replaceChildren();
  tooltip.append(el('strong', '', pct === null ? '平台費率資料未載入' : '已含平台費用（' + pct + '%）'));
  tooltip.append(el('span', '', pct === null ? '目前無法計算 OpenRouter 的含費參考價。' :
    '依 ' + (state.plan === 'standard' ? 'Standard' : 'Business') + ' 儲值手續費等比例換算，非逐筆推論加收。' +
    (state.plan === 'standard' ? '小額儲值另有最低 $0.80 手續費。' : '')));
  tooltip.hidden = false;
  const rect = button.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left + rect.width / 2 - width / 2));
  const top = rect.bottom + tooltip.offsetHeight + 10 > window.innerHeight && rect.top > tooltip.offsetHeight + 12
    ? rect.top - tooltip.offsetHeight - 8 : rect.bottom + 8;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  activeFeeButton = button;
  feePopoverPinned = pinned;
  button.setAttribute('aria-expanded', String(pinned));
}
function feeButton() {
  const button = el('button', 'fee-info-button', '!');
  const rate = currentFeeRate();
  button.type = 'button';
  button.setAttribute('aria-label', rate === null ? 'OpenRouter 費率無法載入，查看說明' : '查看 OpenRouter 已含平台費用（' + (rate * 100).toFixed(1) + '%）的說明');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'feePopover');
  button.addEventListener('mouseenter', () => { if (!feePopoverPinned) showFeePopover(button); });
  button.addEventListener('mouseleave', () => { if (!feePopoverPinned) hideFeePopover(); });
  button.addEventListener('focus', () => { if (!feePopoverPinned) showFeePopover(button); });
  button.addEventListener('blur', () => { if (!feePopoverPinned) hideFeePopover(); });
  button.addEventListener('click', event => {
    event.stopPropagation();
    if (feePopoverPinned && activeFeeButton === button) hideFeePopover();
    else showFeePopover(button, true);
  });
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  });
  return button;
}
function appendPrice(node, quote, value) {
  const wrap = el('span', 'price-with-info');
  wrap.append(el('span', '', dollars(value)));
  if (quote.provider === 'OpenRouter') wrap.append(feeButton());
  node.append(wrap);
}

function setupListeners() {
  $('families').addEventListener('click', event => {
    const button = event.target.closest('[data-family]');
    if (!button) return;
    state.family = button.dataset.family;
    for (const chip of document.querySelectorAll('.chip')) {
      const active = chip === button;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
    renderTable();
  });
  $('search').addEventListener('input', event => { state.search = event.target.value.trim().toLowerCase(); renderTable(); });
  $('provider').addEventListener('change', event => { state.provider = event.target.value; renderTable(); });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; renderTable(); });
  $('inputTokens').addEventListener('input', renderCalculator);
  $('outputTokens').addEventListener('input', renderCalculator);
  $('billingPlans').addEventListener('click', event => {
    const button = event.target.closest('[data-plan]');
    if (!button || state.plan === button.dataset.plan) return;
    state.plan = button.dataset.plan;
    hideFeePopover();
    for (const option of document.querySelectorAll('[data-plan]')) {
      const active = option === button;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    }
    renderTable();
    renderDetail();
  });
  document.addEventListener('click', event => {
    if (feePopoverPinned && !event.target.closest('.fee-info-button')) hideFeePopover();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideFeePopover(); });
  window.addEventListener('resize', hideFeePopover);
}

function filteredQuotes() {
  const items = state.quotes.filter(q => {
    if (state.family !== 'all' && q.family !== state.family) return false;
    if (state.provider !== 'all' && q.provider !== state.provider) return false;
    const haystack = `${q.model_id} ${q.model_name} ${q.provider}`.toLowerCase();
    return haystack.includes(state.search);
  });
  const orderKey = ({input:'input_usd_m', output:'output_usd_m', total:'total'})[state.sort];
  items.sort((a,b) => {
    if (orderKey) {
      const aValue = priceValue(a,orderKey), bValue = priceValue(b,orderKey);
      if (aValue === null && bValue !== null) return 1;
      if (bValue === null && aValue !== null) return -1;
      if (aValue !== null && bValue !== null && aValue !== bValue) return aValue - bValue;
    }
    return a.model_id.localeCompare(b.model_id) || a.provider.localeCompare(b.provider);
  });
  return items;
}

function renderTable() {
  const quotes = filteredQuotes();
  const tbody = $('priceRows');
  hideFeePopover();
  tbody.replaceChildren();
  $('shownCount').textContent = `${quotes.length.toLocaleString('zh-TW')} 筆報價`;
  $('emptyState').hidden = quotes.length > 0;
  if (!state.quotes.length) {
    $('emptyTitle').textContent = '尚無價格資料';
    $('emptyText').textContent = '請在 GitHub Actions 執行首次 full 更新；若來源暫時無法讀取，網站不會顯示未驗證的價格。';
  } else if (!quotes.length) {
    $('emptyTitle').textContent = '找不到符合條件的模型';
    $('emptyText').textContent = '請調整搜尋文字、模型系列或供應平台篩選。';
  }
  // No external data is ever interpolated into HTML markup.
  const fragment = document.createDocumentFragment();
  for (const q of quotes.slice(0, 2000)) {
    const tr = el('tr', 'quote-row' + (state.selectedQuoteId === q.id ? ' selected' : ''));
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `查看 ${q.model_id} 在 ${q.provider} 的比較`);
    const modelCell = el('td', 'model-cell');
    modelCell.append(el('strong', '', q.model_id), el('small', '', q.family));
    const providerCell = el('td', 'provider-cell', q.provider);
    providerCell.append(el('span', 'type-tag', q.provider_type === 'official_channel' ? '官方通路＊' : '第三方'));
    const inputCell = el('td', 'num dollar');
    const outputCell = el('td', 'num dollar');
    const totalCell = el('td', 'num sum');
    appendPrice(inputCell, q, priceValue(q, 'input_usd_m'));
    appendPrice(outputCell, q, priceValue(q, 'output_usd_m'));
    appendPrice(totalCell, q, priceValue(q, 'total'));
    const sourceCell = el('td');
    const src = el('span', 'source-tag' + (q.verification === 'provider_api' ? ' direct' : '') + (q.status !== 'current' ? ' stale' : ''),
      q.status === 'anomaly_hold' ? '異常暫緩' : q.status === 'stale' ? '前次有效值' : q.verification === 'provider_api' ? '平台 API' : '社群彙整');
    sourceCell.append(src);
    const arrow = el('td', 'open-arrow', '↗');
    tr.append(modelCell, providerCell, inputCell, outputCell, totalCell, sourceCell, arrow);
    const choose = () => { state.selectedQuoteId = q.id; renderTable(); renderDetail();
      if (window.matchMedia('(max-width: 750px)').matches) $('comparison').scrollIntoView({behavior:'smooth'});
    };
    tr.addEventListener('click', choose);
    tr.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    fragment.appendChild(tr);
  }
  tbody.appendChild(fragment);
}
function renderDetail() {
  const chosen = state.quotes.find(q => q.id === state.selectedQuoteId);
  if (!chosen) return;
  const peers = state.quotes.filter(q => q.model_id === chosen.model_id)
    .sort((a,b) => (priceValue(a,'total') ?? Infinity) - (priceValue(b,'total') ?? Infinity));
  const detail = $('modelDetail');
  detail.className = '';
  detail.replaceChildren();
  const heading = el('div', 'details-header');
  const caption = el('div');
  caption.append(el('strong', '', chosen.model_id), el('span','', `${peers.length} 家平台報價 · 標準文字 Token`));
  const link = el('a', 'official-link', '核對官方價格 ↗');
  link.href = safeLink(chosen.official_reference); link.rel = 'noopener noreferrer'; link.target = '_blank';
  heading.append(caption, link);
  detail.append(heading);
  const table = el('table', 'mini-table');
  const thead = el('thead');
  const headerRow = el('tr');
  for (const name of ['平台', '輸入', '輸出', '來源']) headerRow.append(el('th', '', name));
  thead.append(headerRow);
  const tbody = el('tbody');
  for (const q of peers) {
    const row = el('tr');
    if (q.id === chosen.id) row.className = 'selected';
    const inputCell = el('td');
    const outputCell = el('td');
    appendPrice(inputCell, q, priceValue(q, 'input_usd_m'));
    appendPrice(outputCell, q, priceValue(q, 'output_usd_m'));
    row.append(el('td', '', q.provider), inputCell, outputCell);
    const anchorCell = el('td');
    const a = el('a', '', '報價 ↗');
    a.href = safeLink(q.source_url); a.target = '_blank'; a.rel = 'noopener noreferrer';
    anchorCell.append(a); row.append(anchorCell);
    tbody.append(row);
  }
  table.append(thead, tbody);
  detail.append(table);
  detail.append(el('p','source-note','＊「官方通路」價格由第三方資料庫彙整，並非直接擷取官方網頁。'));
  $('calcModel').textContent = chosen.provider + (chosen.provider === 'OpenRouter' ? ' (' + (state.plan === 'standard' ? 'Standard' : 'Business') + ')' : '') + ' · ' + chosen.model_id;
  renderCalculator();
  renderChart(chosen);
}
function positiveNumberInput(id, allowZero = true) {
  const raw = $(id).value.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : null;
}
function renderCalculator() {
  const chosen = state.quotes.find(q => q.id === state.selectedQuoteId);
  const output = $('calcPrice');
  output.replaceChildren();
  if (!chosen) { output.textContent = '—'; return; }
  const inp = positiveNumberInput('inputTokens');
  const out = positiveNumberInput('outputTokens');
  const displayed = quoteWithFees(chosen);
  const total = inp === null || out === null || inp > 1e10 || out > 1e10 ? null
    : window.ApiFees.inferenceCost(displayed, inp, out);
  if (!displayed) output.textContent = '平台費率資料無法載入';
  else if (total === null) output.textContent = '輸入數量無效';
  else appendPrice(output, chosen, total);
  $('calcNote').textContent = chosen.provider === 'OpenRouter'
    ? '已按儲值手續費換算為含費參考價；非逐筆推論加收。Standard 小額儲值最低 $0.80，稅、快取與特殊級距另計。'
    : '依模型牌價估算；未建檔的平台費、稅、快取與特殊級距另計。';
}

function renderChart(chosen) {
  const svg = $('trendChart'); svg.replaceChildren();
  const events = state.history.filter(e => e.id === chosen.id && typeof e.input_usd_m === 'number' && e.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at)).slice(-90);
  $('chartPlaceholder').hidden = events.length > 0;
  if (!events.length) return;
  const points = events.map(e => chosen.provider === 'OpenRouter' && currentFeeRate() !== null ? e.input_usd_m * (1 + currentFeeRate()) : e.input_usd_m);
  const yMin = Math.min(...points), yMax = Math.max(...points), spread = Math.max(yMax - yMin, 0.001);
  const xy = points.map((v,i) => [17 + (events.length === 1 ? 0 : i * 446 / (events.length-1)), 100 - (v-yMin)/spread * 75]);
  const svgNS='http://www.w3.org/2000/svg';
  for (const y of [25,50,75,100]) {
    const line = document.createElementNS(svgNS,'line');
    line.setAttribute('x1','0');line.setAttribute('x2','480');line.setAttribute('y1',String(y));line.setAttribute('y2',String(y));
    line.setAttribute('stroke','#e7eef2');line.setAttribute('stroke-width','1');svg.appendChild(line);
  }
  const path = document.createElementNS(svgNS,'path');
  path.setAttribute('d', xy.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+','+p[1].toFixed(2)).join(' '));
  path.setAttribute('fill','none');path.setAttribute('stroke','#168a96');path.setAttribute('stroke-width','2.5');
  path.setAttribute('stroke-linejoin','round');svg.appendChild(path);
  const last = xy[xy.length - 1];
  const dot = document.createElementNS(svgNS,'circle');
  dot.setAttribute('cx',String(last[0]));dot.setAttribute('cy',String(last[1]));dot.setAttribute('r','4');dot.setAttribute('fill','#168a96');svg.append(dot);
}
async function init() {
  setupListeners();
  try {
    const [pricesResponse, historyResponse, feeResponse] = await Promise.all([
      fetch('./data/prices.json', {cache:'no-store'}),
      fetch('./data/history.json', {cache:'no-store'}),
      fetch('./data/provider-fees.json', {cache:'no-store'}),
    ]);
    if (!pricesResponse.ok || !historyResponse.ok) throw new Error('HTTP status error');
    const prices = await pricesResponse.json();
    const history = await historyResponse.json();
    if (feeResponse.ok) {
      try {
        const policies = await feeResponse.json();
        if (policies?.schema_version === 1 && policies.providers?.OpenRouter) {
          state.feePolicies = policies;

        }
      } catch (e) { console.warn('Fee policy unavailable:', e); }
    }
    if (!Array.isArray(prices.quotes) || !Array.isArray(history.events)) throw new Error('Unexpected data schema');
    state.quotes = prices.quotes;
    state.history = history.events;
    $('statModels').textContent = new Set(prices.quotes.map(q => q.model_id)).size.toLocaleString('zh-TW');
    $('statQuotes').textContent = prices.quotes.length.toLocaleString('zh-TW');
    $('statProviders').textContent = new Set(prices.quotes.map(q => q.provider)).size.toLocaleString('zh-TW');
    $('statWarnings').textContent = (prices.anomalies || []).length.toLocaleString('zh-TW');
    if (prices.published_at) {
      $('freshness').replaceChildren(el('span', 'meta-dot'), document.createTextNode(` 最後發布：${formatStamp(prices.published_at)}`));
    }
    const providerSelect = $('provider');
    for (const provider of [...new Set(prices.quotes.map(q => q.provider))].sort()) {
      const option = el('option', '', provider); option.value = provider; providerSelect.appendChild(option);
    }
    if (prices.quotes.length) {
      state.selectedQuoteId = prices.quotes.find(q => q.family === 'GPT')?.id || prices.quotes[0].id;
      renderDetail();
    }
  } catch (error) {
    console.warn('Unable to read price snapshot:', error);
    $('emptyText').textContent = '資料檔讀取失敗。請檢查 GitHub Actions 是否成功發布，或稍後重新整理。';
  }
  renderTable();
}
init();
