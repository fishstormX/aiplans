import type { SubscriptionSeed } from './verified-2026-10-subscriptions';

/** Pure serialization, shared by the seed writer and DB-free regression tests. */
export function subscriptionPlanRow(seed: SubscriptionSeed, providerId: number, now: Date) {
  return {
    provider_id: providerId, product_id: providerId, name: seed.name, slug: seed.slug,
    pricing_model: 'subscription', price: seed.price, annual_price: seed.annualPrice,
    price_yearly_monthly: seed.annualPrice == null ? null : seed.annualPrice / 12,
    currency: seed.currency, price_unit: seed.priceUnit,
    tier: seed.tier, tier_rank: seed.tierRank, is_official: seed.isOfficial, is_contact_sales: false,
    access_from_china: seed.accessFromChina, region: seed.region, source: 'manual',
    plan_kind: seed.planKind, plan_category: seed.planCategory, plan_line: seed.planLine,
    billing_granularity: seed.billingGranularity, features: seed.features,
    quotas: seed.quotas, model_selector: seed.modelSelector,
    third_party_coverage: seed.thirdPartyCoverage,
    third_party_coverage_note: seed.thirdPartyCoverageNote,
    notes: [
      ...seed.noteLines,
      ...(seed.quotaNote ? [`Allowance: ${seed.quotaNote}`] : []),
      ...(seed.sourceQuote ? [`Source quote: ${seed.sourceQuote}`] : []),
      ...(seed.sourceUrl ? [`Source: ${seed.sourceUrl}`] : []),
    ].join('\n'),
    last_verified: seed.verifiedAt ? new Date(seed.verifiedAt) : null, updated_at: now,
  };
}
