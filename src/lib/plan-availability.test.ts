import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import { TranslationsProvider } from './translations';
import { isClosedToNewUsers } from './plan-availability';
import type { PlanComparison } from './compare-plans';

// Exercise the real query shaping and page rendering against deterministic rows.
// Node 20 has no mock.module; replace cached dependencies before loading callers.
const requireModule = createRequire(resolve('src/lib/plan-availability.test.ts'));
function stubModule(id: string, exports: unknown) {
  requireModule(id);
  const cached = requireModule.cache[requireModule.resolve(id)];
  assert.ok(cached);
  const original = cached.exports;
  cached.exports = exports;
  after(() => { cached.exports = original; });
}

const providers = [
  { id: 1, name: 'Vendor', slug: 'vendor', region: 'global', website: 'https://vendor.example', pricing_url: 'https://vendor.example/signup' },
  { id: 2, name: 'Reseller', slug: 'reseller', region: 'global', website: 'https://reseller.example', pricing_url: 'https://reseller.example/signup' },
];

function plan(id: number, slug: string, price: number, kind: string, closed = false, providerId = 1) {
  return {
    id, slug, name: slug, price, plan_kind: kind, provider_id: providerId,
    tier: 'pro', price_unit: 'per_month', pricing_model: 'subscription', currency: 'USD',
    features: closed ? { availability: 'closed_to_new_users' } : [],
    annual_price: null, is_contact_sales: false, pack_validity_days: null,
    quotas: [{ amount_min: 10, amount_max: 50, unit: 'prompt', period: '5h' }],
    monthly_message_limit: null, context_window: null, access_from_china: false,
    region: 'global', last_verified: '2026-10-13',
  };
}
const allPlans = [
  plan(1, 'legacy-chat', 1, 'chat', true), plan(2, 'current-chat', 20, 'chat'),
  plan(3, 'legacy-coding', 2, 'coding', true), plan(4, 'current-coding', 50, 'coding'),
  plan(5, 'legacy-reseller', 0.5, 'chat', true, 2), plan(6, 'current-reseller', 15, 'chat', false, 2),
];
let plans = allPlans;
const model = { id: 1, name: 'Test Model', slug: 'test-model', provider_ids: [1] };
const sql = Object.assign(async (strings: TemplateStringsArray) => {
  const query = strings.join('?');
  if (/FROM models/.test(query)) return [model];
  if (/FROM model_offical/.test(query)) return [{ model_id: 1, producer_id: 1 }];
  if (/FROM model_plan_mapping/.test(query)) return plans.map((p) => ({ plan_id: p.id, model_id: 1, priority: 0 }));
  if (/FROM providers/.test(query)) return /WHERE slug/.test(query) ? [providers[0]] : providers;
  if (/FROM plans/.test(query)) return /WHERE provider_id/.test(query) ? plans.filter((p) => p.provider_id === 1) : plans;
  throw new Error(`Unexpected query: ${query}`);
}, { array: (values: unknown[]) => values });

stubModule('./db', { sql, INT4_ARRAY: 1007, TEXT_ARRAY: 1009 });
stubModule('./coupons', { getActiveCouponMap: async () => ({}) });
stubModule('../components/SiteHeader', { __esModule: true, default: () => null });
const { getPlanComparison } = requireModule('./compare-plans') as typeof import('./compare-plans');
const { default: ProviderPlansPage } = requireModule('../app/[locale]/plans/[provider]/page') as typeof import('../app/[locale]/plans/[provider]/page');
const { default: ComparePlansView } = requireModule('../app/[locale]/compare/plans/[model]/compare-plans-view') as typeof import('../app/[locale]/compare/plans/[model]/compare-plans-view');
const { buildCompareFaqs } = requireModule('../app/[locale]/compare/plans/[model]/faqs') as typeof import('../app/[locale]/compare/plans/[model]/faqs');

test('closure detection accepts only object metadata with the exact closed status', () => {
  assert.equal(isClosedToNewUsers({ availability: 'closed_to_new_users' }), true);
  for (const features of [null, undefined, [], ['closed_to_new_users'], {}, { availability: 'open' }]) {
    assert.equal(isClosedToNewUsers(features), false);
  }
});

test('comparison keeps historical rows but excludes them from all cheapest recommendations and baselines', async () => {
  const comparison = await getPlanComparison('test-model');
  assert.ok(comparison);
  assert.equal(comparison.summary.totalPlans, 6);
  assert.equal(comparison.officialPlans.length, 4);
  assert.equal(comparison.thirdPartyPlans.length, 2);
  assert.equal(comparison.summary.cheapestPlan?.name, 'current-reseller');
  assert.deepEqual(comparison.summary.cheapestByKind.map((p) => [p.kind, p.planSlug]), [
    ['chat', 'current-reseller'], ['coding', 'current-coding'],
  ]);
  assert.equal(comparison.thirdPartyPlans.find((p) => p.plan.slug === 'current-reseller').vsOfficial.priceDiffPercent, -25);
});

for (const [locale, messages] of [['en', enMessages], ['zh', zhMessages]] as const) {
  test(`${locale} provider and comparison pages label historical rows, suppress their signups, and render ranges`, async () => {
    const providerHtml = renderToStaticMarkup(await ProviderPlansPage({
      params: Promise.resolve({ locale, provider: 'vendor' }), searchParams: Promise.resolve({}),
    }));
    assert.ok(providerHtml.includes(messages.planAvailability.closed));
    assert.ok(providerHtml.includes('legacy-chat'));
    assert.equal((providerHtml.match(/href="https:\/\/vendor.example\/signup"/g) ?? []).length, 2);
    const products = [...providerHtml.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1]))
      .filter((data) => data['@type'] === 'Product');
    assert.deepEqual(products.map((p) => p.name), ['Vendor current-chat', 'Vendor current-coding']);
    assert.match(providerHtml, locale === 'zh' ? /10–50 次提问／每 5 小时/ : /10–50 prompts per 5 hours/);

    const comparison = await getPlanComparison('test-model');
    assert.ok(comparison);
    const html = renderComparison(comparison, locale, messages);
    assert.ok(html.includes(messages.planAvailability.closed));
    assert.ok(html.includes('legacy-reseller'));
    assert.equal((html.match(/<a\b[^>]*>Subscribe</g) ?? []).length, locale === 'en' ? 3 : 0);
    assert.equal((html.match(/<a\b[^>]*>订阅</g) ?? []).length, locale === 'zh' ? 3 : 0);
    assert.match(html, locale === 'zh' ? /10–50 次提问／每 5 小时/ : /10–50 prompts per 5 hours/);
    assert.doesNotMatch(html, /Vendor publishes only a relative multiple|厂商只公布相对倍率/);
  });
}

function renderComparison(comparison: PlanComparison, locale: string, messages: Parameters<typeof TranslationsProvider>[0]['messages']) {
  return renderToStaticMarkup(createElement(TranslationsProvider,
    { messages } as Parameters<typeof TranslationsProvider>[0],
    createElement(ComparePlansView, {
      locale, data: comparison, faqs: [], couponByProvider: {},
    }),
  ));
}

test('an all-closed comparison has no current price floor, recommendations or signup actions', async () => {
  plans = [...allPlans.filter((p) => isClosedToNewUsers(p.features)), plan(7, 'legacy-free', 0, 'chat', true)];
  try {
    const comparison = await getPlanComparison('test-model');
    assert.ok(comparison);
    assert.equal(comparison.summary.totalPlans, 4);
    assert.equal(comparison.summary.cheapestPlan, null);
    assert.deepEqual(comparison.summary.cheapestByKind, []);
    const html = renderComparison(comparison, 'en', enMessages);
    assert.doesNotMatch(html, />Subscribe<|>Recommended<|\$0\.00/);
    assert.ok(html.includes(enMessages.planAvailability.closed));
    assert.equal(buildCompareFaqs(comparison, 'en').some((faq) => /cheapest|free|annual/.test(faq.question)), false);
    const providerHtml = renderToStaticMarkup(await ProviderPlansPage({
      params: Promise.resolve({ locale: 'en', provider: 'vendor' }), searchParams: Promise.resolve({}),
    }));
    assert.ok(providerHtml.includes('legacy-free'));
    assert.doesNotMatch(providerHtml, /Subscribe →|"@type":"Product"/);
  } finally {
    plans = allPlans;
  }
});
