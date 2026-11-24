/* One scenario per request, reused for 1 / 10 / 50 API calls. No backend. */
(function (root) {
  'use strict';
  const validPrice = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const safeInt = (x, max) => Number.isSafeInteger(x) && x >= 0 && x <= max;

  function normalizeInputs(input) {
    if (!input || typeof input !== 'object') return null;
    const keys = ['prompt', 'user', 'rag', 'historyPer', 'historyCount', 'output'];
    const values = {};
    for (const key of keys) {
      if (!safeInt(input[key], key === 'historyCount' ? 100000 : 1000000000)) return null;
      values[key] = input[key];
    }
    const history = values.historyPer * values.historyCount;
    const totalInput = values.prompt + values.user + values.rag + history;
    if (!Number.isSafeInteger(history) || !Number.isSafeInteger(totalInput) || totalInput > 1e12) return null;
    return Object.assign({}, values, {history: history, input: totalInput, cachePrefix: values.prompt + history});
  }

  function feeRate(provider, plan, policies) {
    if (provider !== 'OpenRouter') return 0;
    if (plan !== 'standard' && plan !== 'business') return null;
    const rate = policies && policies.providers && policies.providers.OpenRouter &&
      policies.providers.OpenRouter[plan] && policies.providers.OpenRouter[plan].credit_purchase_rate;
    return validPrice(rate) && rate <= 1 ? rate : null;
  }

  function estimateOnce(quote, rawInputs, options) {
    const inputs = normalizeInputs(rawInputs);
    if (!quote || !inputs || !options || !validPrice(quote.input_usd_m) ||
        !validPrice(quote.output_usd_m)) return {ok:false, reason:'invalid'};
    const rate = feeRate(quote.provider, options.plan, options.policies);
    if (rate === null) return {ok:false, reason:'fee_unavailable'};
    const hit = options.cache === 'hit';
    const cacheTokens = hit ? inputs.cachePrefix : 0;
    const regularTokens = inputs.input - cacheTokens;
    if (hit && cacheTokens > 0 && !validPrice(quote.cache_read_usd_m))
      return {ok:false, reason:'cache_unavailable'};
    const normalInputCost = regularTokens * quote.input_usd_m / 1000000;
    const cacheReadCost = cacheTokens > 0 ? cacheTokens * quote.cache_read_usd_m / 1000000 : 0;
    const outputCost = inputs.output * quote.output_usd_m / 1000000;
    const baseCost = normalInputCost + cacheReadCost + outputCost;
    const platformFee = baseCost * rate;
    const total = baseCost + platformFee;
    if (![normalInputCost, cacheReadCost, outputCost, total].every(Number.isFinite))
      return {ok:false, reason:'invalid'};
    return {ok:true, inputTokens:inputs.input, outputTokens:inputs.output,
      cacheTokens:cacheTokens, regularTokens:regularTokens, normalInputCost:normalInputCost,
      cacheReadCost:cacheReadCost, outputCost:outputCost, baseCost:baseCost,
      platformFee:platformFee, rate:rate, total:total,
      // The hit scenario is a warm-cache what-if. No initial cache creation/write is included.
      assumption: hit ? 'warm_cache_each_request' : 'no_cache'};
  }

  function estimateMany(quote, inputs, options, times) {
    const single = estimateOnce(quote, inputs, options);
    if (!single.ok) return single;
    if (!safeInt(times, 100000) || times < 1) return {ok:false, reason:'invalid'};
    return Object.assign({}, single, {
      calls:times, total:single.total * times, baseCost:single.baseCost * times,
      platformFee:single.platformFee * times, normalInputCost:single.normalInputCost * times,
      cacheReadCost:single.cacheReadCost * times, outputCost:single.outputCost * times,
      inputTokens:single.inputTokens * times, outputTokens:single.outputTokens * times,
      cacheTokens:single.cacheTokens * times, regularTokens:single.regularTokens * times
    });
  }

  function validateFx(obj) {
    const rate = obj && (obj.usd_twd !== undefined ? obj.usd_twd : obj.usd && obj.usd.twd);
    return validPrice(rate) && rate > 1 && rate < 100 && typeof (obj.rate_date || obj.date) === 'string'
      ? {rate:rate, date:obj.rate_date || obj.date, source:obj.source || null} : null;
  }

  // All visible costs have three decimals. Tiny nonzero values must not appear free.
  function formatUSD(number) {
    if (!validPrice(number)) return 'USD —';
    if (number > 0 && number < 0.001) return '<$0.001';
    return '$' + number.toLocaleString('en-US', {minimumFractionDigits:3, maximumFractionDigits:3});
  }

  function formatTWD(number, rate) {
    if (!validPrice(number) || !validPrice(rate) || !rate) return 'NT$ —';
    const converted = number * rate;
    if (!validPrice(converted)) return 'NT$ —';
    if (converted > 0 && converted < 0.001) return '<NT$0.001';
    return 'NT$' + converted.toLocaleString('en-US', {minimumFractionDigits:3, maximumFractionDigits:3});
  }

  const api = Object.freeze({normalizeInputs,feeRate,estimateOnce,estimateMany,validateFx,formatUSD,formatTWD});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CostCore = api;
})(typeof globalThis === 'object' ? globalThis : this);
