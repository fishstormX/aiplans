#!/usr/bin/env tsx
/**
 * Seed ChatGPT Pro 100/200/500 and refresh OpenRouter floor prices for four
 * open-weight models, verified 2026-10-13 against official sources.
 *
 * Dry-run by default; --apply writes.
 * Atomic: phase 1 resolves every provider, plan, model and price row (read-only).
 * If anything fails to resolve, the script exits 1 and writes nothing. Phase 2
 * performs all writes inside one transaction.
 */
import { databaseSql as sql } from './db/postgres-admin';
import {
  CHATGPT_PRO_PLANS,
  OPENROUTER_FLOOR_PRICES,
  LEGACY_CHATGPT_PRO_SLUG,
  LEGACY_CHATGPT_PRO_NOTE,
  CHATGPT_PRO_3P_NOTE,
  VERIFIED_AT_ISO,
  type OpenRouterFloorSeed,
} from './data/verified-2026-10-chatgpt-pro-openrouter';
import { subscriptionPlanRow } from './data/subscription-plan-row';
import type { SubscriptionSeed } from './data/verified-2026-10-subscriptions';

const APPLY = process.argv.includes('--apply');
const NOW = new Date();
const VERIFIED_AT = new Date(VERIFIED_AT_ISO);

type Id = { id: number };
type PlanStep = { seed: SubscriptionSeed; existingId: number | null };
type LegacyStep = { id: number; notes: string } | null;
type FloorStep = { floor: OpenRouterFloorSeed; modelId: number; modelSlug: string; existingId: number | null };

const errors: string[] = [];

/** Case-insensitive exact match on each candidate, then a unique ILIKE contains match. */
export async function resolveModel(candidates: string[]): Promise<{ id: number; slug: string } | null> {
  for (const slug of candidates) {
    const rows = await sql<Array<{ id: number; slug: string }>>`
      SELECT id, slug FROM models WHERE lower(slug) = lower(${slug}) ORDER BY id LIMIT 2`;
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) {
      errors.push(`ambiguous case-insensitive slug ${slug}: ${rows.map((r) => r.slug).join(', ')}`);
      return null;
    }
  }
  const stem = candidates[0]?.replace(/^(openai|qwen|google|nvidia)-/, '') ?? '';
  if (!stem) return null;
  const rows = await sql<Array<{ id: number; slug: string }>>`
    SELECT id, slug FROM models WHERE slug ILIKE ${`%${stem}%`} ORDER BY id LIMIT 5`;
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) errors.push(`ambiguous model for ${candidates[0]}: ${rows.map((r) => r.slug).join(', ')}`);
  return null;
}

async function plan() {
  const providers = await sql<Array<{ id: number; slug: string }>>`
    SELECT id, slug FROM providers WHERE slug IN ('openai', 'openrouter')`;
  const openai = providers.find((p) => p.slug === 'openai');
  const openrouter = providers.find((p) => p.slug === 'openrouter');
  if (!openai) errors.push('missing provider openai');
  if (!openrouter) errors.push('missing provider openrouter');

  const plans: PlanStep[] = [];
  let legacy: LegacyStep = null;
  if (openai) {
    console.log('ChatGPT Pro tiers');
    for (const seed of CHATGPT_PRO_PLANS) {
      const [row] = await sql<Id[]>`SELECT id FROM plans WHERE provider_id = ${openai.id} AND slug = ${seed.slug}`;
      plans.push({ seed, existingId: row?.id ?? null });
      console.log(`  ${row ? '↻' : '➕'} plan openai/${seed.slug}: USD ${seed.price}/mo, quotas ${JSON.stringify(seed.quotas)}, third_party_coverage=${seed.thirdPartyCoverage}`);
    }
    const [old] = await sql<Array<{ id: number; notes: string | null }>>`
      SELECT id, notes FROM plans WHERE provider_id = ${openai.id} AND slug = ${LEGACY_CHATGPT_PRO_SLUG}`;
    if (!old) console.log(`  · legacy ${LEGACY_CHATGPT_PRO_SLUG}: not present`);
    else if ((old.notes ?? '').includes('[aiplans:superseded-by')) console.log(`  · legacy ${LEGACY_CHATGPT_PRO_SLUG}: already marked`);
    else {
      legacy = { id: old.id, notes: old.notes ?? '' };
      console.log(`  ↻ legacy ${LEGACY_CHATGPT_PRO_SLUG}: mark superseded (keep row), third_party_coverage=none`);
    }
  }

  const floors: FloorStep[] = [];
  if (openrouter) {
    console.log('\nOpenRouter floor prices');
    for (const floor of OPENROUTER_FLOOR_PRICES) {
      const model = await resolveModel(floor.modelSlugCandidates);
      if (!model) {
        errors.push(`model not found for ${floor.openRouterId} (candidates: ${floor.modelSlugCandidates.join(', ')})`);
        console.log(`  ✗ ${floor.openRouterId}: not resolved`);
        continue;
      }
      const [row] = await sql<Id[]>`
        SELECT id FROM api_channel_prices WHERE model_id = ${model.id} AND provider_id = ${openrouter.id} ORDER BY id LIMIT 1`;
      floors.push({ floor, modelId: model.id, modelSlug: model.slug, existingId: row?.id ?? null });
      console.log(`  ${row ? '↻' : '➕'} openrouter/${model.slug}: in $${floor.inputPer1m} / out $${floor.outputPer1m} (floor ${floor.floorProvider})`);
    }
  }
  return { openai, openrouter, plans, legacy, floors };
}

function floorNotes(floor: OpenRouterFloorSeed) {
  const also = (floor.alsoSeen ?? [])
    .map((a) => `${a.provider} $${a.inputPer1m}/$${a.outputPer1m}${a.note ? ` (${a.note})` : ''}`)
    .join('; ');
  return [
    `OpenRouter cheapest host (floor): ${floor.floorProvider} $${floor.inputPer1m}/$${floor.outputPer1m} per 1M.`,
    also ? `Also seen: ${also}.` : null,
    `Verified ${VERIFIED_AT_ISO} against ${floor.sourceUrl} and /api/v1/models/${floor.openRouterId}/endpoints.`,
    'Headline written as OpenRouter channel price; upstream variants remain from the scraper when present.',
  ].filter(Boolean).join(' ');
}

async function main() {
  console.log(`\n💵 seed-verified-2026-10-chatgpt-pro-openrouter ${APPLY ? '[APPLY]' : '[DRY-RUN]'}\n`);
  const p = await plan();

  if (errors.length) {
    console.error(`\n❌ ${errors.length} item(s) failed to resolve; nothing written:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nResolved: ${p.plans.length} plans, ${p.legacy ? 1 : 0} legacy mark, ${p.floors.length} OpenRouter prices.`);
  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to write (single transaction).');
    return;
  }

  await sql.begin(async (rawTx) => {
    // postgres.js TransactionSql typing drops the call signature; runtime is the same.
    const tx = rawTx as unknown as typeof sql;
    for (const step of p.plans) {
      const row = subscriptionPlanRow(step.seed, p.openai!.id, NOW);
      const keys = Object.keys(row) as Array<keyof typeof row>;
      if (step.existingId) await tx`UPDATE plans SET ${tx(row as never, ...(keys as never[]))} WHERE id = ${step.existingId}`;
      else await tx`INSERT INTO plans ${tx(row as never, ...(keys as never[]))}`;
    }
    if (p.legacy) {
      await tx`UPDATE plans SET notes = ${`${LEGACY_CHATGPT_PRO_NOTE}\n${p.legacy.notes}`.trim()},
        third_party_coverage = 'none', third_party_coverage_note = ${CHATGPT_PRO_3P_NOTE},
        last_verified = ${VERIFIED_AT}, updated_at = ${NOW} WHERE id = ${p.legacy.id}`;
    }
    for (const step of p.floors) {
      const row = {
        model_id: step.modelId, provider_id: p.openrouter!.id,
        input_price_per_1m: step.floor.inputPer1m, output_price_per_1m: step.floor.outputPer1m,
        currency: 'USD', price_unit: 'per_1m_tokens', is_available: true,
        notes: floorNotes(step.floor), last_verified: VERIFIED_AT, updated_at: NOW,
      };
      const keys = Object.keys(row) as Array<keyof typeof row>;
      if (step.existingId) await tx`UPDATE api_channel_prices SET ${tx(row, ...keys)} WHERE id = ${step.existingId}`;
      else await tx`INSERT INTO api_channel_prices ${tx(row, ...keys)}`;
    }
  });
  console.log('✅ Applied in one transaction.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());
