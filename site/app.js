'use strict';

const state = {
  quotes: [], history: [], family: 'all', search: '', provider: 'all',
  sort: 'model', selectedQuoteId: null, feePolicies: null,
};
const $ = id => document.getElementById(id);
const dollars = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  const digits = value < 0.001 ? 7 : value < 0.1 ? 5 : value < 1 ? 4 : 2;
  return '$' + value.toLocaleString('en-US', {maximumFractionDigits: digits});
};
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
  $('feeMode').addEventListener('change', renderCalculator);
  $('creditAmount').addEventListener('input', renderCalculator);
  $('byokPrior').addEventListener('input', renderCalculator);
}

function filteredQuotes() {
  const items = state.quotes.filter(q => {
    if (state.family !== 'all' && q.family !== state.family) return false;
    if (state.provider !== 'all' && q.provider !== state.provider) return false;
    const haystack = `${q.model_id} ${q.model_name} ${q.provider}`.toLowerCase();
    return haystack.includes(state.search);
  });
  const byNumber = ({input: 'input_usd_m', output: 'output_usd_m'})[state.sort];
  items.sort((a, b) => {
    if (byNumber) return a[byNumber] - b[byNumber] || a.model_id.localeCompare(b.model_id);
    if (state.sort === 'total') return a.input_usd_m + a.output_usd_m - b.input_usd_m - b.output_usd_m;
    return a.model_id.localeCompare(b.model_id) || a.provider.localeCompare(b.provider);
  });
  return items;
}

function renderTable() {
  const quotes = filteredQuotes();
  const tbody = $('priceRows');
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
    const inputCell = el('td', 'num dollar', dollars(q.input_usd_m));
    const outputCell = el('td', 'num dollar', dollars(q.output_usd_m));
    const totalCell = el('td', 'num sum', dollars(q.input_usd_m + q.output_usd_m));
    const feeCell = el('td', 'fee-table-cell');
    feeCell.append(el('span', q.provider === 'OpenRouter' && state.feePolicies?.providers?.OpenRouter ? 'fee-known' : 'fee-unknown',
      q.provider === 'OpenRouter' && state.feePolicies?.providers?.OpenRouter ? '儲值 5.5% 起 · 詳情' : '未建檔'));
    const sourceCell = el('td');
    const src = el('span', 'source-tag' + (q.verification === 'provider_api' ? ' direct' : '') + (q.status !== 'current' ? ' stale' : ''),
      q.status === 'anomaly_hold' ? '異常暫緩' : q.status === 'stale' ? '前次有效值' : q.verification === 'provider_api' ? '平台 API' : '社群彙整');
    sourceCell.append(src);
    const arrow = el('td', 'open-arrow', '↗');
    tr.append(modelCell, providerCell, inputCell, outputCell, totalCell, feeCell, sourceCell, arrow);
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
    .sort((a,b) => a.input_usd_m + a.output_usd_m - b.input_usd_m - b.output_usd_m);
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
  for (const name of ['平台', '輸入', '輸出', '平台費', '來源']) headerRow.append(el('th', '', name));
  thead.append(headerRow);
  const tbody = el('tbody');
  for (const q of peers) {
    const row = el('tr');
    if (q.id === chosen.id) row.className = 'selected';
    row.append(el('td', '', q.provider), el('td', '', dollars(q.input_usd_m)),
      el('td', '', dollars(q.output_usd_m)), el('td', '', q.provider === 'OpenRouter' && state.feePolicies?.providers?.OpenRouter ? '儲值 5.5% 起' : '未建檔'));
    const anchorCell = el('td');
    const a = el('a', '', '報價 ↗');
    a.href = safeLink(q.source_url); a.target = '_blank'; a.rel = 'noopener noreferrer';
    anchorCell.append(a); row.append(anchorCell);
    tbody.append(row);
  }
  table.append(thead, tbody);
  detail.append(table);
  detail.append(el('p','source-note','＊「官方通路」價格由第三方資料庫彙整，並非直接擷取官方網頁。'));
  $('calcModel').textContent = `${chosen.provider} · ${chosen.model_id}`;
  renderCalculator();
  renderChart(chosen);
}
function positiveNumberInput(id, allowZero = true) {
  const raw = $(id).value.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : null;
}
function addFeeRow(parent, name, value, strong = false) {
  const row = el('div', 'fee-result-row' + (strong ? ' strong' : ''));
  row.append(el('span', '', name), el('b', '', value));
  parent.append(row);
}
function renderFeeCalculator(chosen, inference) {
  const feeConfig = state.feePolicies?.providers?.OpenRouter;
  const isRouter = chosen?.provider === 'OpenRouter' && feeConfig;
  $('openRouterFeePanel').hidden = !isRouter;
  $('feeNonOpenRouter').hidden = !!isRouter;
  $('feeNonOpenRouter').textContent = chosen?.provider === 'OpenRouter'
    ? '平台費率資料載入失敗，請以官方價格頁為準。'
    : '目前僅建檔 OpenRouter 的手續費；其他平台「未建檔」不等於免費。';
  if (!isRouter) return;
  const mode = $('feeMode').value;
  const byok = mode === 'byok';
  const enterprise = mode === 'enterprise';
  $('feeTopupControls').hidden = byok || enterprise;
  $('feeByokControls').hidden = !byok;
  $('feeDisclaimer').textContent = byok
    ? '估算採 OpenRouter 公開模型牌價作為參考；原廠帳單、平台費的儲值成本及稅額另計。'
    : '儲值金額是購買點數的付款試算，不能和單次 Token 使用成本相加當作相同支出。';
  const out = $('feeResult');
  out.replaceChildren();
  if (enterprise) {
    out.append(el('p', 'fee-help', 'Enterprise 依個別合約計價，無法用固定比例推估。'));
    return;
  }
  if (inference === null) {
    out.append(el('p', 'fee-error', '請先輸入有效的 Token 數量。'));
    return;
  }
  if (byok) {
    const prior = positiveNumberInput('byokPrior');
    const result = prior === null ? null : window.ApiFees.byok(inference, prior, feeConfig.byok);
    if (!result) { out.append(el('p', 'fee-error', '請輸入有效的本月 BYOK 先前用量。')); return; }
    addFeeRow(out, '本次模型牌價估算', dollars(result.listPriceCost));
    addFeeRow(out, '本次超出免費額度的用量', dollars(result.newExcess));
    addFeeRow(out, 'OpenRouter 額外平台費 (5%)', dollars(result.fee));
    addFeeRow(out, '推論＋平台費參考合計', dollars(result.totalEstimate), true);
    return;
  }
  const credits = positiveNumberInput('creditAmount', false);
  const rule = feeConfig[mode];
  const result = credits === null || credits > 1e8 ? null : window.ApiFees.topup(credits, rule);
  if (!result) { out.append(el('p', 'fee-error', '請輸入有效的儲值點數金額。')); return; }
  addFeeRow(out, '購買點數', dollars(result.credits));
  addFeeRow(out, `儲值手續費 (${(rule.credit_purchase_rate*100).toFixed(1)}%)`, dollars(result.fee));
  addFeeRow(out, '本次儲值預計付款', dollars(result.payment), true);
  out.append(el('p', 'fee-help', `本次選定模型的 Token 推論估算為 ${dollars(inference)}，使用時從點數餘額扣除。`));
}
function renderCalculator() {
  const chosen = state.quotes.find(q => q.id === state.selectedQuoteId);
  if (!chosen) { $('calcPrice').textContent = '—'; renderFeeCalculator(null, null); return; }
  const inp = positiveNumberInput('inputTokens');
  const out = positiveNumberInput('outputTokens');
  const total = inp === null || out === null || inp > 1e10 || out > 1e10 ? null
    : window.ApiFees.inferenceCost(chosen, inp, out);
  $('calcPrice').textContent = total === null ? '輸入數量無效' : dollars(total);
  renderFeeCalculator(chosen, total);
}

function renderChart(chosen) {
  const svg = $('trendChart'); svg.replaceChildren();
  const events = state.history.filter(e => e.id === chosen.id && typeof e.input_usd_m === 'number' && e.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at)).slice(-90);
  $('chartPlaceholder').hidden = events.length > 0;
  if (!events.length) return;
  const points = events.map(e => e.input_usd_m);
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
          $('feePolicyDate').textContent = `政策核對：${policies.last_verified_at}`;
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
