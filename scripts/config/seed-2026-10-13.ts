/** Static, DB-free snapshot supplied/verified on 2026-10-13. */
import type { ModelSelector } from '../../src/lib/plan-selector';
import type { Quota } from '../../src/lib/plan-economics';
import type { JSONValue } from 'postgres';

export const LAST_VERIFIED = '2026-10-13T00:00:00.000Z';
export const XAI_PROVIDER_SLUG = 'grok'; // scripts/utils/provider-config.ts
export const X_PRICING_URL = 'https://x.ai/pricing';
export const META_MODELS_URL = 'https://ai.developer.meta.com/docs/models';
export const MUSE_SUBSCRIPTIONS_URL = 'https://ai.developer.meta.com/docs/muse-code/subscriptions';
export const MUSE_PRESS_URL = 'https://venturebeat.com/technology/metas-new-muse-wonder-and-muse-wonder-full-models-achieve-frontier-performance-but-only-the-weaker-one-is-available-via-api';

export interface Provenance {
  sourceUrl: string;
  sourceQuote: string;
  lastVerified: string;
}

export function sourceNotes(source: Provenance): string {
  return `Source: ${source.sourceUrl}\nSource quote: ${source.sourceQuote}\nLast verified: ${source.lastVerified}`;
}

export const META_PROVIDER = {
  slug: 'meta',
  name: 'Meta',
  website: 'https://ai.developer.meta.com',
  sourceUrl: META_MODELS_URL,
  sourceQuote: 'Meta Model API hosts Muse Wonder; Muse Wonder Full is available only through Muse Code subscriptions.',
  lastVerified: LAST_VERIFIED,
};

export const VERIFIED_MODELS = [
  {
    providerSlug: 'meta', slug: 'muse-wonder-1.0', name: 'Muse Wonder',
    contextWindow: 1_048_576, openSource: false, subscriptionOnly: false,
    sourceUrl: META_MODELS_URL,
    sourceQuote: 'Muse Wonder (muse-wonder-1.0): 1,048,576-token context; Model API and every Muse Code plan. Closed source; no downloadable weights.',
    lastVerified: LAST_VERIFIED,
  },
  {
    providerSlug: 'meta', slug: 'muse-wonder-full', name: 'Muse Wonder Full',
    contextWindow: null, openSource: false, subscriptionOnly: true,
    sourceUrl: META_MODELS_URL,
    sourceQuote: 'Muse Wonder Full: not available on Model API; available only in Muse Code Power Usage and Maximum Usage. No public API price; closed source.',
    lastVerified: LAST_VERIFIED,
  },
];

export const VERIFIED_API_PRICES = [{
  providerSlug: 'meta', modelSlug: 'muse-wonder-1.0',
  inputPricePer1m: 4, cachedInputPricePer1m: 0.20, outputPricePer1m: 20,
  currency: 'USD', priceUnit: 'per_1m_tokens',
  sourceUrl: 'https://ai.developer.meta.com/docs/pricing-rate-limits',
  sourceQuote: 'Muse Wonder Standard API list rates per 1M tokens: input USD 4, cached input USD 0.20, output USD 20.',
  lastVerified: LAST_VERIFIED,
}];

export interface VerifiedPlanSeed extends Provenance {
  providerSlug: string;
  slug: string;
  name: string;
  tier: string;
  tierRank: number;
  price: number;
  currency: 'USD';
  planKind: 'bundle' | 'coding';
  planLine: 'x-subscription' | 'muse-code';
  secondaryKinds: string[];
  isOfficial: true;
  features: Record<string, JSONValue>;
  // Keep a published range without inventing a scalar amount that the
  // economics calculator would turn into a misleading effective rate.
  quotas: (Quota & { amount_min?: number; amount_max?: number })[];
  modelSelector: ModelSelector | null;
  notes: string;
}

const xTiers = [
  { tier: 'free', label: 'Free', price: 0, multiplier: null },
  { tier: 'plus', label: 'Plus', price: 8, multiplier: 1 },
  { tier: 'premium', label: 'Premium', price: 30, multiplier: 4 },
  { tier: 'super', label: 'Super', price: 100, multiplier: 15 },
  { tier: 'ultra', label: 'Ultra', price: 200, multiplier: 50 },
] as const;

const museTiers = [
  { tier: 'everyday', label: 'Everyday', price: 5, multiplier: null, full: false },
  { tier: 'high', label: 'High', price: 15, multiplier: 5, full: false },
  { tier: 'power', label: 'Power', price: 50, multiplier: 20, full: true },
  { tier: 'maximum', label: 'Maximum', price: 200, multiplier: 80, full: true },
] as const;

export const VERIFIED_PLANS: VerifiedPlanSeed[] = [
  ...xTiers.map((entry, tierRank): VerifiedPlanSeed => ({
    providerSlug: XAI_PROVIDER_SLUG,
    slug: `x-subscription-${entry.tier}`, name: `X Subscription ${entry.label}`,
    tier: entry.tier, tierRank, price: entry.price, currency: 'USD',
    planKind: 'bundle', planLine: 'x-subscription', secondaryKinds: ['chat', 'coding', 'agent'],
    isOfficial: true,
    features: {
      shared_usage_pool: { products: ['grok', 'cursor', 'x'], refresh: 'week' },
      third_party_models_available: tierRank >= 2,
      ...(tierRank >= 2 ? { third_party_models_billing: 'api_list_price_topup' } : {}),
    },
    quotas: entry.multiplier == null ? [] : [{
      unit: 'relative', period: 'week', derived_from: 'x-subscription-plus', multiplier: entry.multiplier,
      note: `${entry.multiplier}x Plus AI usage; one shared pool, not a separate allowance per product.`,
    }],
    // The pool is verified, but the per-tier model catalog is not enumerated
    // by these sources. Do not claim every Grok API SKU as an entitlement.
    modelSelector: null,
    notes: [
      'Monthly USD subscription. AI usage is shared across Grok, Cursor and Grok on X; refreshes weekly.',
      entry.tier === 'free' ? 'Free usage is limited; no numeric allowance published.' : `${entry.multiplier}x the Plus shared usage allowance.`,
      tierRank >= 2
        ? 'Third-party models in Cursor are billed separately through top-ups at API list prices; not included in the subscription.'
        : 'Third-party models in Cursor require Premium or above and are not included in this tier.',
    ].join('\n'),
    sourceUrl: X_PRICING_URL,
    sourceQuote: `USD ${entry.price}/month for ${entry.label}; ${entry.multiplier == null ? 'limited usage' : `${entry.multiplier}x Plus`}. Shared Grok/Cursor pool resets weekly. Cursor third-party models cost extra at API list rates on Premium and above.`,
    lastVerified: LAST_VERIFIED,
  })),
  ...museTiers.map((entry, tierRank): VerifiedPlanSeed => ({
    providerSlug: 'meta', slug: `muse-code-${entry.tier}`, name: `Muse Code ${entry.label}`,
    tier: entry.tier, tierRank, price: entry.price, currency: 'USD',
    planKind: 'coding', planLine: 'muse-code', secondaryKinds: [], isOfficial: true,
    features: {
      models: ['muse-wonder-1.0', ...(entry.full ? ['muse-wonder-full'] : [])],
      price_source: 'secondary_press', price_source_url: MUSE_PRESS_URL,
      ...(entry.tier === 'everyday' ? { prompt_allowance: { min: 10, max: 50, period: '5h' } } : {}),
    },
    quotas: entry.multiplier == null
      ? [{ unit: 'prompt', period: '5h', amount_min: 10, amount_max: 50, note: '10-50 prompts every 5 hours; published range, not a fixed allowance.' }]
      : [{ unit: 'relative', derived_from: 'muse-code-everyday', multiplier: entry.multiplier, note: `${entry.multiplier}x Everyday usage; no fixed prompt count published.` }],
    modelSelector: { only_extra: true, extra: ['muse-wonder-1.0', ...(entry.full ? ['muse-wonder-full'] : [])] },
    notes: [
      `Monthly USD subscription; USD ${entry.price} reported by secondary press (VentureBeat), not visible on official subscription docs.`,
      `Price source: ${MUSE_PRESS_URL}`,
      `Model entitlement source: ${META_MODELS_URL}`,
      entry.tier === 'everyday' ? '10-50 prompts every 5 hours.' : `${entry.multiplier}x Everyday usage.`,
      entry.full ? 'Includes Muse Wonder and Muse Wonder Full.' : 'Includes Muse Wonder; Wonder Full requires Power or Maximum.',
      'Subscription applies only to Muse Code; additional API keys are billed pay-as-you-go.',
    ].join('\n'),
    sourceUrl: MUSE_SUBSCRIPTIONS_URL,
    sourceQuote: `${entry.label} Usage: ${entry.multiplier == null ? '10-50 prompts per 5-hour window' : `${entry.multiplier}x Everyday allowance`}. USD ${entry.price}/month comes from secondary press (VentureBeat); $ amounts were not visible on official docs.`,
    lastVerified: LAST_VERIFIED,
  })),
];

export const LEGACY_CLOSURE = {
  sourceUrl: 'https://forum.cursor.com/t/introducing-the-x-subscription/174450',
  sourceQuote: 'Old Cursor Ultra no longer available for new signups; switching is rolling out to existing Cursor, SuperGrok and X Premium subscribers.',
  lastVerified: LAST_VERIFIED,
  notesPrefix: 'closed to new users since 2026-10-13',
  availability: 'closed_to_new_users', successor: 'x-subscription',
  rules: [
    { providerSlugs: ['grok', 'xai', 'x-ai'], namePattern: '^super[ -]?grok', slugPattern: '^super-?grok' },
    { providerSlugs: ['cursor'], namePattern: '^cursor[ -]+(pro\\+?|ultra|teams)(?:\\b|[ +(-])', slugPattern: '^(?:cursor-)?(?:pro(?:-plus|\\+)?|ultra|teams)(?:$|[-+])' },
    { providerSlugs: ['x', 'twitter', 'x-twitter', 'grok', 'xai', 'x-ai'], namePattern: '^x[ -]+premium', slugPattern: '^(?:x-)?premium' },
  ],
};

export function matchesLegacyPlan(providerSlug: string, slug: string, name: string): boolean {
  return LEGACY_CLOSURE.rules.some((rule) =>
    rule.providerSlugs.includes(providerSlug.toLowerCase()) &&
    (new RegExp(rule.slugPattern, 'i').test(slug) || new RegExp(rule.namePattern, 'i').test(name)),
  );
}

export function legacyPlanPatch(notes: string | null, features: unknown): {
  notes: string; features: Record<string, JSONValue>; last_verified: string;
} {
  const previousFeatures = Array.isArray(features)
    ? { legacy_features: features as JSONValue[] }
    : features != null && typeof features === 'object' ? features as Record<string, JSONValue> : {};
  const provenance = sourceNotes(LEGACY_CLOSURE);
  const previousNotes = (notes ?? '').replace(new RegExp(`^${LEGACY_CLOSURE.notesPrefix}\\n?`), '');
  return {
    notes: [LEGACY_CLOSURE.notesPrefix, previousNotes, previousNotes.includes(provenance) ? '' : provenance].filter(Boolean).join('\n'),
    features: {
      ...previousFeatures, availability: LEGACY_CLOSURE.availability,
      successor: LEGACY_CLOSURE.successor,
      availability_source: {
        sourceUrl: LEGACY_CLOSURE.sourceUrl, sourceQuote: LEGACY_CLOSURE.sourceQuote, lastVerified: LEGACY_CLOSURE.lastVerified,
      },
    },
    last_verified: LAST_VERIFIED,
  };
}
