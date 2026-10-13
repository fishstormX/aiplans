/**
 * Verified 2026-10-13 (SGT) against official sources.
 * Pure data, no DB access — unit-tested; applied by
 * scripts/seed-verified-2026-10-chatgpt-pro-openrouter.ts (dry-run by default).
 *
 * ChatGPT Pro: OpenAI Help Center About ChatGPT Pro tiers + Release Notes 2026-10-06.
 * OpenRouter floors: OpenRouter /api/v1/models/{id}/endpoints, cheapest host by
 * (input, then output) among listed provider endpoints. aitokenprice figures that
 * disagree with live OpenRouter endpoints are NOT written — see PR body.
 */
import type { SubscriptionSeed } from './verified-2026-10-subscriptions';

export const VERIFIED_AT_ISO = '2026-10-13T10:00:00.000Z';

const PRO_SRC_TIERS = 'https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers';
const PRO_SRC_NOTES = 'https://help.openai.com/en/articles/6825453-chatgpt-release-notes';
const PRO_SRC_PRICING = 'https://openai.com/chatgpt/pricing/';

/** Marker so future scrapers/seeds can find the single-slug Pro row we supersede. */
export const CHATGPT_PRO_SUPERSEDED_MARKER = '[aiplans:superseded-by chatgpt-pro-100,chatgpt-pro-200,chatgpt-pro-500 2026-10-13]';

const GPT_PRO_SELECTOR = {
  families: ['gpt-5', 'gpt-5.5', 'gpt-5.6', 'gpt-4o', 'gpt-4.1'],
  extra: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'],
} as const;

function chatgptPro(
  slug: string,
  name: string,
  tierRank: number,
  price: number,
  ultrafast: boolean,
  extraNotes: string[],
): SubscriptionSeed {
  return {
    providerSlug: 'openai',
    slug,
    name,
    tier: 'pro',
    tierRank,
    price,
    planKind: 'chat',
    planCategory: 'chatbot',
    planLine: 'chatgpt',
    modelSlugs: [],
    modelSelector: { ...GPT_PRO_SELECTOR },
    quotas: [],
    features: [
      'Pro models, Codex, deep research, image creation, memory and file uploads',
      ultrafast
        ? 'Astra Ultrafast / Sol Ultrafast included (Pro 500 only)'
        : 'Ultrafast not included (buying credits on this tier does not unlock Ultrafast)',
      'Credits available for eligible Codex / ChatGPT Work / Office add-in usage after included allowance',
    ],
    quotaNote: ultrafast
      ? 'Highest included usage of the three Pro plans; Ultrafast uses included allowance at 8× Standard for GPT-6 Astra / GPT-6.1 Sol, then credits at 6×.'
      : 'Included usage allowance is plan-specific; OpenAI does not publish absolute token counts on the Help Center page.',
    noteLines: [
      'ChatGPT Pro is sold as three monthly plans (Pro 100 / Pro 200 / Pro 500) as of the 2026-10-06 release notes.',
      ...extraNotes,
      `Sources: ${PRO_SRC_TIERS} ; ${PRO_SRC_NOTES} ; ${PRO_SRC_PRICING}`,
    ],
    sourceUrl: PRO_SRC_TIERS,
    sourceQuote: `${name} $${price}/month`,
  };
}

/**
 * Three Pro rungs. tierRank sits between Plus (2) and Business (was 4):
 * Pro 100=3, Pro 200=4, Pro 500=5; Business/Team/Enterprise shift +2 in classifications.
 */
export const CHATGPT_PRO_PLANS: SubscriptionSeed[] = [
  chatgptPro('chatgpt-pro-100', 'ChatGPT Pro 100', 3, 100, false, [
    'Pro 100: $100/month; Ultrafast not included.',
  ]),
  chatgptPro('chatgpt-pro-200', 'ChatGPT Pro 200', 4, 200, false, [
    'Pro 200: $200/month; Ultrafast not included.',
    'New Pro 200 subscriptions that are not eligible for grandfathering include a lower usage allowance than previously offered; price stays $200.',
    'Grandfathering: active Pro 200 at any point from 2026-09-22 through 10 a.m. PT on 2026-09-29 keeps the previous included allowance through 2026-10-29 while the subscription stays active; then moves to the lower allowance. Keeping the allowance does not upgrade to Pro 500 or add Ultrafast.',
  ]),
  chatgptPro('chatgpt-pro-500', 'ChatGPT Pro 500', 5, 500, true, [
    'Pro 500: $500/month; highest included usage; Astra Ultrafast (and GPT-6.1 Sol Ultrafast) available in the model picker.',
    'Among Pro plans, Ultrafast is only on Pro 500. Credits on Pro 100/200 do not unlock Ultrafast.',
  ]),
];

/** Old single chatgpt-pro row: keep but mark superseded (not deleted). */
export const LEGACY_CHATGPT_PRO_SLUG = 'chatgpt-pro';
export const LEGACY_CHATGPT_PRO_NOTE =
  `${CHATGPT_PRO_SUPERSEDED_MARKER} Replaced by ChatGPT Pro 100 / Pro 200 / Pro 500 (OpenAI Help Center About ChatGPT Pro tiers, updated 2026-10). Prefer chatgpt-pro-200 for the historical $200 Pro SKU.`;

export interface OpenRouterFloorSeed {
  /** OpenRouter model id (provider/model). */
  openRouterId: string;
  /** Candidate model slugs in our DB (first match wins). */
  modelSlugCandidates: string[];
  displayName: string;
  inputPer1m: number;
  outputPer1m: number;
  floorProvider: string;
  /** Other hosts checked while verifying; not written as the headline. */
  alsoSeen?: Array<{ provider: string; inputPer1m: number; outputPer1m: number; note?: string }>;
  sourceUrl: string;
  verified: true;
}

/**
 * Cheapest OpenRouter host per model, checked 2026-10-13 SGT via
 * GET https://openrouter.ai/api/v1/models/{id}/endpoints
 */
export const OPENROUTER_FLOOR_PRICES: OpenRouterFloorSeed[] = [
  {
    openRouterId: 'openai/gpt-oss-120b',
    modelSlugCandidates: ['openai-gpt-oss-120b', 'gpt-oss-120b'],
    displayName: 'gpt-oss-120b',
    inputPer1m: 0.03,
    outputPer1m: 0.15,
    floorProvider: 'Venice',
    alsoSeen: [
      { provider: 'CoreWeave', inputPer1m: 0.03, outputPer1m: 0.17 },
      { provider: 'DekaLLM', inputPer1m: 0.03, outputPer1m: 0.18 },
    ],
    sourceUrl: 'https://openrouter.ai/openai/gpt-oss-120b',
    verified: true,
  },
  {
    openRouterId: 'qwen/qwen3.8-27b',
    modelSlugCandidates: ['qwen-qwen3-8-27b', 'qwen-qwen3.8-27b', 'qwen3.8-27b', 'qwen3-8-27b'],
    displayName: 'Qwen3.8 27B',
    // Live floor is Tenstorrent $0.02/$0.50. Chutes $0.039/$1.25 (cited by
    // aitokenprice 2026-10 report) is NOT the current cheapest host.
    inputPer1m: 0.02,
    outputPer1m: 0.5,
    floorProvider: 'Tenstorrent',
    alsoSeen: [
      { provider: 'Chutes', inputPer1m: 0.039, outputPer1m: 1.25, note: 'aitokenprice Oct report figure; not current floor' },
    ],
    sourceUrl: 'https://openrouter.ai/qwen/qwen3.8-27b',
    verified: true,
  },
  {
    openRouterId: 'qwen/qwen3.6-35b-a3b',
    modelSlugCandidates: ['qwen-qwen3-6-35b-a3b', 'qwen-qwen3.6-35b-a3b', 'qwen3.6-35b-a3b'],
    displayName: 'Qwen3.6 35B-A3B',
    inputPer1m: 0.05,
    outputPer1m: 0.7,
    floorProvider: 'Darkbloom',
    sourceUrl: 'https://openrouter.ai/qwen/qwen3.6-35b-a3b',
    verified: true,
  },
  {
    openRouterId: 'google/gemma-4-26b-a4b-it',
    modelSlugCandidates: [
      'google-gemini-gemma-4-26b-a4b-it',
      'google-gemma-4-26b-a4b-it',
      'gemma-4-26b-a4b-it',
      'gemma-4-26b-a4b',
    ],
    displayName: 'Gemma 4 26B-A4B',
    inputPer1m: 0.042,
    outputPer1m: 0.22,
    floorProvider: 'Darkbloom',
    sourceUrl: 'https://openrouter.ai/google/gemma-4-26b-a4b-it',
    verified: true,
  },
  {
    openRouterId: 'nvidia/nemotron-3-super-120b-a12b',
    modelSlugCandidates: [
      'nvidia-nemotron-3-super-120b-a12b',
      'nemotron-3-super-120b-a12b',
      'nemotron-3-super',
    ],
    displayName: 'Nemotron 3 Super',
    // Lowest input is DekaLLM $0.08/$0.45 (matches OpenRouter models API
    // headline). DeepInfra $0.085/$0.40 is cheaper on 3:1 blended — noted, not used as floor.
    inputPer1m: 0.08,
    outputPer1m: 0.45,
    floorProvider: 'DekaLLM',
    alsoSeen: [
      { provider: 'DeepInfra', inputPer1m: 0.085, outputPer1m: 0.4, note: 'cheaper 3:1 blended; not lowest input' },
    ],
    sourceUrl: 'https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b',
    verified: true,
  },
  {
    openRouterId: 'nvidia/nemotron-3.5-lightning',
    modelSlugCandidates: [
      'nvidia-nemotron-3-5-lightning',
      'nvidia-nemotron-3.5-lightning',
      'nemotron-3.5-lightning',
    ],
    displayName: 'Nemotron 3.5 Lightning',
    inputPer1m: 0.025,
    outputPer1m: 0.12,
    floorProvider: 'Darkbloom',
    sourceUrl: 'https://openrouter.ai/nvidia/nemotron-3.5-lightning',
    verified: true,
  },
];
