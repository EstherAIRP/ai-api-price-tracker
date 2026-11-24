/* Fee math is deliberately separate from the model's posted token rates. */
(function (root) {
  'use strict';
  const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  function inferenceCost(quote, inputTokens, outputTokens) {
    if (!quote || ![quote.input_usd_m, quote.output_usd_m, inputTokens, outputTokens].every(valid)) return null;
    return quote.input_usd_m * inputTokens / 1000000 + quote.output_usd_m * outputTokens / 1000000;
  }
  function topup(credits, plan) {
    if (!valid(credits) || credits <= 0 || !plan || !valid(plan.credit_purchase_rate)) return null;
    const fee = Math.max(credits * plan.credit_purchase_rate, plan.minimum_fee_usd || 0);
    return {credits, fee, payment: credits + fee};
  }
  function byok(listPriceCost, priorMonthlyListPriceUsage, rule) {
    if (![listPriceCost, priorMonthlyListPriceUsage].every(valid) || !rule ||
        !valid(rule.standard_business_monthly_free_inference_usd) || !valid(rule.excess_rate)) return null;
    const limit = rule.standard_business_monthly_free_inference_usd;
    const overBefore = Math.max(0, priorMonthlyListPriceUsage - limit);
    const overAfter = Math.max(0, priorMonthlyListPriceUsage + listPriceCost - limit);
    const newExcess = Math.max(0, overAfter - overBefore);
    return {listPriceCost, newExcess, fee: newExcess * rule.excess_rate, totalEstimate: listPriceCost + newExcess * rule.excess_rate};
  }
  const api = Object.freeze({inferenceCost, topup, byok});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ApiFees = api;
})(typeof globalThis === 'object' ? globalThis : this);
