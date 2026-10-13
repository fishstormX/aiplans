#!/usr/bin/env tsx
/**
 * Seed ChatGPT Pro 100/200/500 and refresh OpenRouter floor prices for six
 * open-weight models, verified 2026-10-13 against official sources.
 * Dry-run by default; --apply writes. Merge deploys to production — do not
 * merge until the user approves.
 */
import { db } from './db/queries';
import {
  CHATGPT_PRO_PLANS,
  OPENROUTER_FLOOR_PRICES,
  LEGACY_CHATGPT_PRO_SLUG,
  LEGACY_CHATGPT_PRO_NOTE,
  VERIFIED_AT_ISO,
} from './data/verified-2026-10-chatgpt-pro-openrouter';
import type { SubscriptionSeed } from './data/verified-2026-10-subscriptions';

const APPLY = process.argv.includes('--apply');
const NOW = new Date();
const VERIFIED_AT = new Date(VERIFIED_AT_ISO);

interface ProviderRow { id: number; slug: string; name: string }
let failures = 0;

async function loadProviders() {
  const { data, error } = await db.from('providers').select('id, slug, name');
  if (error) throw error;
  return new Map((data ?? []).map((p: ProviderRow) => [p.slug, p]));
}

function planRow(seed: SubscriptionSeed, provider: ProviderRow) {
  return {
    provider_id: provider.id,
    product_id: provider.id,
    name: seed.name,
    slug: seed.slug,
    pricing_model: 'subscription',
    price: seed.price,
    currency: 'USD',
    price_unit: 'per_month',
    tier: seed.tier,
    tier_rank: seed.tierRank,
    is_official: true,
    is_contact_sales: false,
    access_from_china: false,
    region: 'global',
    source: 'manual',
    plan_kind: seed.planKind,
    plan_category: seed.planCategory,
    plan_line: seed.planLine,
    billing_granularity: 'flat_monthly',
    features: seed.features,
    quotas: seed.quotas,
    model_selector: seed.modelSelector,
    notes: [...seed.noteLines, `Allowance: ${seed.quotaNote}`, `Source quote: ${seed.sourceQuote}`, `Source: ${seed.sourceUrl}`].join('\n'),
    last_verified: VERIFIED_AT,
    updated_at: NOW,
  };
}

async function upsertPlan(seed: SubscriptionSeed, provider: ProviderRow): Promise<number> {
  const existing = provider.id < 0
    ? { data: null, error: null }
    : await db.from('plans').select('id').eq('provider_id', provider.id).eq('slug', seed.slug).maybeSingle();
  if (existing.error) throw existing.error;
  console.log(`  ${existing.data ? '↻' : '➕'} plan ${provider.slug}/${seed.slug}: USD ${seed.price}/mo`);
  if (!APPLY) return existing.data?.id ?? -1;
  const row = planRow(seed, provider);
  if (existing.data) {
    const { error } = await db.from('plans').update(row).eq('id', existing.data.id);
    if (error) throw error;
    return existing.data.id;
  }
  const { data, error } = await db.from('plans').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

async function markLegacyChatgptPro(openai: ProviderRow) {
  const existing = await db.from('plans').select('id, notes').eq('provider_id', openai.id).eq('slug', LEGACY_CHATGPT_PRO_SLUG).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    console.log(`  · legacy ${LEGACY_CHATGPT_PRO_SLUG}: not present`);
    return;
  }
  const notes = existing.data.notes ?? '';
  if (notes.includes('[aiplans:superseded-by')) {
    console.log(`  · legacy ${LEGACY_CHATGPT_PRO_SLUG}: already marked`);
    return;
  }
  console.log(`  ↻ legacy ${LEGACY_CHATGPT_PRO_SLUG}: mark superseded (keep row)`);
  if (!APPLY) return;
  const { error } = await db.from('plans').update({
    notes: `${LEGACY_CHATGPT_PRO_NOTE}\n${notes}`.trim(),
    last_verified: VERIFIED_AT,
    updated_at: NOW,
  }).eq('id', existing.data.id);
  if (error) throw error;
}

async function resolveModelId(candidates: string[]): Promise<{ id: number; slug: string } | null> {
  for (const slug of candidates) {
    const { data, error } = await db.from('models').select('id, slug').eq('slug', slug).maybeSingle();
    if (error) throw error;
    if (data) return data as { id: number; slug: string };
  }
  // loose contains match on first candidate stem
  const stem = candidates[0]?.replace(/^openai-|^qwen-|^google-|^nvidia-/, '') ?? '';
  if (!stem) return null;
  const { data, error } = await db.from('models').select('id, slug').ilike('slug', `%${stem}%`).limit(5);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: number; slug: string }>;
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) {
    console.log(`  ⚠ ambiguous model for ${candidates[0]}: ${rows.map((r) => r.slug).join(', ')}`);
    failures++;
  }
  return null;
}

async function upsertOpenRouterFloor(openrouter: ProviderRow, modelId: number, modelSlug: string, floor: (typeof OPENROUTER_FLOOR_PRICES)[number]) {
  const also = (floor.alsoSeen ?? [])
    .map((a) => `${a.provider} $${a.inputPer1m}/$${a.outputPer1m}${a.note ? ` (${a.note})` : ''}`)
    .join('; ');
  const notes = [
    `OpenRouter cheapest host (floor): ${floor.floorProvider} $${floor.inputPer1m}/$${floor.outputPer1m} per 1M.`,
    also ? `Also seen: ${also}.` : null,
    `Verified ${VERIFIED_AT_ISO} against ${floor.sourceUrl} and /api/v1/models/${floor.openRouterId}/endpoints.`,
    'Headline written as OpenRouter channel price; upstream variants remain from the scraper when present.',
  ].filter(Boolean).join(' ');

  console.log(`  ↻ openrouter/${modelSlug}: in $${floor.inputPer1m} / out $${floor.outputPer1m} (floor ${floor.floorProvider})`);
  if (!APPLY) return;

  const row = {
    model_id: modelId,
    provider_id: openrouter.id,
    input_price_per_1m: floor.inputPer1m,
    output_price_per_1m: floor.outputPer1m,
    currency: 'USD',
    price_unit: 'per_1m_tokens',
    is_available: true,
    notes,
    last_verified: VERIFIED_AT,
    updated_at: NOW,
  };
  const existing = await db.from('api_channel_prices')
    .select('id')
    .eq('model_id', modelId)
    .eq('provider_id', openrouter.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const { error } = existing.data
    ? await db.from('api_channel_prices').update(row).eq('id', existing.data.id)
    : await db.from('api_channel_prices').insert(row);
  if (error) throw error;
}

async function main() {
  console.log(`\n💵 seed-verified-2026-10-chatgpt-pro-openrouter ${APPLY ? '[APPLY]' : '[DRY-RUN]'}\n`);

  const providers = await loadProviders();
  const openai = providers.get('openai');
  if (!openai) {
    console.log('  ⚠ missing provider openai');
    failures++;
  } else {
    console.log('ChatGPT Pro tiers');
    for (const seed of CHATGPT_PRO_PLANS) await upsertPlan(seed, openai);
    await markLegacyChatgptPro(openai);
  }

  const openrouter = providers.get('openrouter');
  if (!openrouter) {
    console.log('  ⚠ missing provider openrouter');
    failures++;
  } else {
    console.log('\nOpenRouter floor prices');
    for (const floor of OPENROUTER_FLOOR_PRICES) {
      const model = await resolveModelId(floor.modelSlugCandidates);
      if (!model) {
        console.log(`  ⚠ model not found for ${floor.openRouterId} (candidates: ${floor.modelSlugCandidates.join(', ')}); skipping write`);
        failures++;
        continue;
      }
      await upsertOpenRouterFloor(openrouter, model.id, model.slug, floor);
    }
  }

  if (!APPLY) console.log('\nDry-run only. Re-run with --apply to write.');
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
