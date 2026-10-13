import assert from 'node:assert/strict';
import test from 'node:test';
import { VERIFIED_PLANS } from '../../scripts/config/seed-2026-10-13';
import { describeEconomics, planEconomics, type EconomicPlan, type Quota } from './plan-economics';

function plan(quotas: Quota[], price = 5): EconomicPlan {
  return {
    slug: 'test-plan', price, currency: 'USD', price_unit: 'per_month',
    is_contact_sales: false, pack_validity_days: null, quotas,
  };
}

test('Muse Everyday renders its published range in both locales without a scalar rate', () => {
  const everyday = VERIFIED_PLANS.find((p) => p.slug === 'muse-code-everyday');
  assert.ok(everyday);
  const economics = planEconomics(plan(everyday.quotas, everyday.price));
  assert.deepEqual(economics, {
    state: 'not_derivable', ratios: [],
    allowances: [{ amount_min: 10, amount_max: 50, unit: 'prompt', period: '5h' }],
  });
  assert.deepEqual(describeEconomics(economics, 'en'), {
    kind: 'allowances', label: 'Published allowance (no fixed unit rate)',
    items: ['10–50 prompts per 5 hours'],
  });
  assert.deepEqual(describeEconomics(economics, 'zh'), {
    kind: 'allowances', label: '已公布额度（无法折算固定单价）',
    items: ['10–50 次提问／每 5 小时'],
  });
});

test('free ranges remain allowances and invalid ranges are not rendered or priced', () => {
  const economics = planEconomics(plan([{ amount_min: 10, amount_max: 50, unit: 'prompt', period: '5h' }], 0));
  assert.equal(economics.state, 'free');
  assert.deepEqual(describeEconomics(economics), {
    kind: 'allowances', label: 'Free allowance', items: ['10–50 prompts per 5 hours'],
  });

  for (const range of [
    { amount_min: 10 }, { amount_max: 50 }, { amount_min: 50, amount_max: 10 },
    { amount_min: -1, amount_max: 50 }, { amount_min: 10, amount_max: Infinity },
  ]) {
    assert.deepEqual(planEconomics(plan([{ ...range, unit: 'prompt', period: '5h' }])), {
      state: 'not_derivable', ratios: [], allowances: [],
    });
  }
});

test('fixed allowances still use the binding window and relative tiers keep usage ratios', () => {
  const economics = planEconomics(plan([
    { amount: 50, unit: 'prompt', period: '5h' },
    { amount: 1000, unit: 'prompt', period: 'month' },
  ]));
  assert.equal(economics.state, 'rate');
  if (economics.state !== 'rate') return;
  assert.ok(Math.abs(economics.rate.valueUSD - 5) < 1e-12);
  assert.ok(Math.abs(economics.rate.unitsPer30Days - 1000) < 1e-9);
  assert.deepEqual(economics.rate.basis, { amount: 1000, unit: 'prompt', period: 'month' });

  const high = VERIFIED_PLANS.find((p) => p.slug === 'muse-code-high');
  assert.ok(high);
  const relative = planEconomics(plan(high.quotas, high.price), () => plan([
    { amount_min: 10, amount_max: 50, unit: 'prompt', period: '5h' },
  ]));
  assert.equal(relative.state, 'not_derivable');
  if (relative.state !== 'not_derivable') return;
  assert.deepEqual(relative.allowances, []);
  assert.equal(relative.ratios[0].multiplier, 5);
  assert.equal(relative.ratios[0].valuePerDollar, 5 / 3);
  assert.equal(describeEconomics(relative).kind, 'ratios');
});

test('one-off allowances without validity are shown without a relative-only label', () => {
  const display = describeEconomics(planEconomics(plan([{ amount: 1000, unit: 'token', period: 'total' }])));
  assert.equal(display.kind, 'allowances');
  if (display.kind !== 'allowances') return;
  assert.deepEqual(display.items, ['1,000 tokens one-off']);
});
