import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  LAST_VERIFIED, XAI_PROVIDER_SLUG, META_PROVIDER, VERIFIED_MODELS,
  VERIFIED_API_PRICES, VERIFIED_PLANS, LEGACY_CLOSURE,
  matchesLegacyPlan, legacyPlanPatch, sourceNotes,
} from './config/seed-2026-10-13';
import { isClosedToNewUsers } from './utils/plan-availability';
import { resolveSelector, type SelectableModel } from '../src/lib/plan-selector';

test('every seeded record and legacy closure carries dated source evidence', () => {
  for (const row of [META_PROVIDER, ...VERIFIED_MODELS, ...VERIFIED_API_PRICES, ...VERIFIED_PLANS, LEGACY_CLOSURE]) {
    assert.equal(row.lastVerified, LAST_VERIFIED);
    assert.equal(new URL(row.sourceUrl).protocol, 'https:');
    assert.ok(row.sourceQuote.length > 20);
    assert.match(sourceNotes(row), /Last verified: 2026-10-13T00:00:00.000Z/);
  }
  assert.equal(new Set(VERIFIED_PLANS.map((row) => `${row.providerSlug}/${row.slug}`)).size, 9);
});

test('X Subscription uses the existing Grok provider and five monthly USD bundle tiers', () => {
  assert.equal(XAI_PROVIDER_SLUG, 'grok');
  const plans = VERIFIED_PLANS.filter((plan) => plan.planLine === 'x-subscription');
  assert.deepEqual(plans.map((plan) => [plan.tier, plan.price, plan.tierRank]), [
    ['free', 0, 0], ['plus', 8, 1], ['premium', 30, 2], ['super', 100, 3], ['ultra', 200, 4],
  ]);
  for (const plan of plans) {
    assert.equal(plan.providerSlug, 'grok');
    assert.equal(plan.planKind, 'bundle');
    assert.equal(plan.currency, 'USD');
    assert.equal(plan.isOfficial, true);
    assert.deepEqual(plan.secondaryKinds, ['chat', 'coding', 'agent']);
    assert.deepEqual(plan.features.shared_usage_pool, { products: ['grok', 'cursor', 'x'], refresh: 'week' });
    assert.equal(plan.features.third_party_models_available, plan.tierRank >= 2);
    assert.equal(plan.features.third_party_models_billing, plan.tierRank >= 2 ? 'api_list_price_topup' : undefined);
    assert.match(plan.notes, /shared.*refreshes weekly/);
    assert.match(plan.notes, /[Tt]hird-party models/);
  }
  assert.deepEqual(plans[0].quotas, []);
  assert.deepEqual(plans.slice(1).map((plan) => plan.quotas[0].multiplier), [1, 4, 15, 50]);
  for (const plan of plans.slice(1)) {
    assert.equal(plan.quotas[0].derived_from, 'x-subscription-plus');
    assert.equal(plan.quotas[0].period, 'week');
    assert.equal(plan.quotas[0].amount, undefined);
  }
});

test('Muse Wonder has exact context and official API rates; Full has no API price', () => {
  assert.deepEqual(VERIFIED_MODELS.map((model) => [model.slug, model.name, model.openSource, model.subscriptionOnly]), [
    ['muse-wonder-1.0', 'Muse Wonder', false, false], ['muse-wonder-full', 'Muse Wonder Full', false, true],
  ]);
  assert.equal(VERIFIED_MODELS[0].contextWindow, 1_048_576);
  assert.equal(VERIFIED_API_PRICES.length, 1);
  const api = VERIFIED_API_PRICES[0];
  assert.equal(api.providerSlug, 'meta');
  assert.equal(api.modelSlug, 'muse-wonder-1.0');
  assert.deepEqual([api.inputPricePer1m, api.cachedInputPricePer1m, api.outputPricePer1m], [4, 0.20, 20]);
  assert.equal(api.currency, 'USD');
  assert.equal(api.priceUnit, 'per_1m_tokens');
});

test('Muse Code selectors grant Wonder on all tiers and Full only on Power/Maximum', () => {
  const plans = VERIFIED_PLANS.filter((plan) => plan.planLine === 'muse-code');
  assert.deepEqual(plans.map((plan) => [plan.tier, plan.price, plan.tierRank]), [
    ['everyday', 5, 0], ['high', 15, 1], ['power', 50, 2], ['maximum', 200, 3],
  ]);
  const catalog: SelectableModel[] = [
    ...VERIFIED_MODELS.map((model, id) => ({ id, slug: model.slug, providerSlugs: ['meta'], elo: null })),
    { id: 99, slug: 'muse-spark-1.3', providerSlugs: ['meta'], elo: null },
  ];
  for (const plan of plans) {
    assert.equal(plan.planKind, 'coding');
    assert.equal(plan.currency, 'USD');
    assert.equal(plan.isOfficial, true);
    assert.equal(plan.modelSelector?.only_extra, true);
    const selected = resolveSelector(plan.modelSelector, catalog, ['meta']);
    const expected = ['muse-wonder-1.0', ...(plan.tierRank >= 2 ? ['muse-wonder-full'] : [])];
    assert.deepEqual(selected.models.map((model) => model.slug), expected);
    assert.deepEqual(selected.unknownExtra, []);
    assert.equal(plan.features.price_source, 'secondary_press');
    assert.match(plan.sourceQuote, /secondary press \(VentureBeat\).*\$ amounts were not visible on official docs/);
  }
});

test('Muse usage preserves the Everyday range and upper-tier relative allowances', () => {
  const plans = VERIFIED_PLANS.filter((plan) => plan.planLine === 'muse-code');
  const everyday = plans[0].quotas[0];
  assert.equal(everyday.unit, 'prompt');
  assert.equal(everyday.period, '5h');
  assert.deepEqual([everyday.amount_min, everyday.amount_max], [10, 50]);
  assert.equal(everyday.amount, undefined);
  assert.match(everyday.note ?? '', /10-50 prompts every 5 hours/);
  assert.deepEqual(plans.slice(1).map((plan) => plan.quotas[0].multiplier), [5, 20, 80]);
  for (const plan of plans.slice(1)) {
    assert.equal(plan.quotas[0].unit, 'relative');
    assert.equal(plan.quotas[0].derived_from, 'muse-code-everyday');
    assert.equal(plan.quotas[0].amount, undefined);
  }
});

test('legacy matching covers DB slug/name variants and respects provider scope', () => {
  for (const row of [
    ['grok', 'supergrok', 'SuperGrok'], ['xai', 'super-grok-heavy', 'SuperGrok Heavy'],
    ['grok', 'imported-legacy', 'SuperGrok Premium'],
    ['cursor', 'cursor-pro', 'Pro'], ['cursor', 'cursor-pro-plus', 'Pro+'],
    ['cursor', 'ultra-yearly', 'Ultra'], ['cursor', 'cursor-teams-monthly', 'Teams'],
    ['cursor', 'imported-legacy', 'Cursor Pro+'], ['cursor', 'imported-legacy', 'Cursor Teams (yearly)'],
    ['x', 'x-premium', 'X Premium'], ['twitter', 'x-premium-plus', 'X Premium+'],
    ['grok', 'imported-legacy', 'X Premium+'],
  ]) assert.equal(matchesLegacyPlan(...row as [string, string, string]), true, row.join('/'));
  for (const row of [
    ['meta', 'supergrok', 'SuperGrok'], ['anthropic', 'cursor-pro', 'Cursor Pro'],
    ['cursor', 'cursor-free', 'Cursor Free'], ['cursor', 'enterprise', 'Cursor Enterprise'],
    ['grok', 'x-subscription-premium', 'X Subscription Premium'],
    ['meta', 'muse-code-power', 'Muse Code Power'],
  ]) assert.equal(matchesLegacyPlan(...row as [string, string, string]), false, row.join('/'));
});

test('legacy closure is idempotent and preserves prior notes and array/object features', () => {
  for (const features of [null, ['Original allowance', 'Legacy feature'], { custom: true }]) {
    const patch = legacyPlanPatch('Original notes', features);
    assert.equal(patch.features.availability, 'closed_to_new_users');
    assert.equal(patch.features.successor, 'x-subscription');
    assert.equal(patch.last_verified, LAST_VERIFIED);
    assert.ok(patch.notes.startsWith(`${LEGACY_CLOSURE.notesPrefix}\n`));
    assert.match(patch.notes, /Original notes/);
    assert.deepEqual(legacyPlanPatch(patch.notes, patch.features), patch);
    assert.equal(isClosedToNewUsers(patch.features), true);
    if (Array.isArray(features)) assert.deepEqual(patch.features.legacy_features, features);
    if (features && !Array.isArray(features)) assert.equal(patch.features.custom, true);
  }
  assert.deepEqual(legacyPlanPatch(null, null), legacyPlanPatch(legacyPlanPatch(null, null).notes, legacyPlanPatch(null, null).features));
  for (const value of [null, [], ['closed_to_new_users'], {}, { availability: 'open' }]) {
    assert.equal(isClosedToNewUsers(value), false);
  }
});

test('default dry-run loads without a usable DB and prints the complete offline manifest', () => {
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), resolve('scripts/seed-2026-10-13.ts')], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'invalid-on-purpose' }, timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN \/ OFFLINE/);
  const manifest = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  assert.equal(manifest.plans.length, 9);
  assert.equal(manifest.models.length, 2);
  assert.equal(manifest.apiChannelPrices.length, 1);
  assert.deepEqual(manifest.skipped, ['GLM-Legal: no public price']);
  for (const plan of manifest.plans) {
    assert.equal(plan.source, 'manual');
    assert.equal(plan.last_verified, LAST_VERIFIED);
    assert.equal(plan.price_unit, 'per_month');
    assert.equal(plan.provider_id, undefined);
  }
});
