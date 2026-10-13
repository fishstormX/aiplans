#!/usr/bin/env tsx
/**
 * Idempotent verified X Subscription / Meta Muse seed, modeled on
 * seed-verified-creative-plan-prices.ts. Default: offline manifest only.
 * --apply imports the DB client and writes everything in one transaction.
 *
 * Scraper audit: grok-dynamic.ts only emits API prices; index-plans-dynamic.ts
 * has no Grok, Cursor, X or Meta subscription scraper. upsertPlan() does not
 * write notes but normally replaces features; it now skips closed rows.
 * cleanupOutdatedPlans() is log-only. Retired plans and mappings are kept.
 * Models/providers lack last_verified/source columns, so their provenance
 * lives in description/notes. Plans and API prices use notes + last_verified.
 * GLM-Legal is deliberately skipped: no public price supplied.
 */
import type { Sql } from 'postgres';
import {
  LAST_VERIFIED, XAI_PROVIDER_SLUG, META_PROVIDER, VERIFIED_MODELS,
  VERIFIED_API_PRICES, VERIFIED_PLANS, LEGACY_CLOSURE,
  sourceNotes, matchesLegacyPlan, legacyPlanPatch, type VerifiedPlanSeed,
} from './config/seed-2026-10-13';
import { resolveSelector, type SelectableModel } from '../src/lib/plan-selector';

function planRow(seed: VerifiedPlanSeed, providerId: number) {
  return {
    provider_id: providerId, product_id: providerId,
    name: seed.name, slug: seed.slug, tier: seed.tier,
    pricing_model: 'subscription', price: seed.price, annual_price: null,
    currency: seed.currency, price_unit: 'per_month',
    is_official: seed.isOfficial, is_contact_sales: false,
    access_from_china: false, region: 'global', source: 'manual',
    plan_kind: seed.planKind, plan_category: seed.planKind === 'coding' ? 'coding' : 'chatbot',
    plan_line: seed.planLine, tier_rank: seed.tierRank, secondary_kinds: seed.secondaryKinds,
    features: seed.features, quotas: seed.quotas, model_selector: seed.modelSelector,
    notes: `${seed.notes}\n${sourceNotes(seed)}`, last_verified: seed.lastVerified,
  };
}

async function applySeed(sql: Sql) {
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    // Serialize concurrent invocations before check/insert on plans, whose
    // identity is (provider_id, slug), like the creative-price seed.
    await tx`SELECT pg_advisory_xact_lock(hashtext('seed-2026-10-13'))`;
    const providers = await tx<{ id: number; slug: string }[]>`SELECT id, slug FROM providers`;
    const providerIds = new Map(providers.map((row) => [row.slug, row.id]));
    if (!providerIds.has(XAI_PROVIDER_SLUG)) {
      throw new Error(`Missing existing xAI provider '${XAI_PROVIDER_SLUG}'; refusing to create a duplicate.`);
    }

    if (!providerIds.has(META_PROVIDER.slug)) {
      const [provider] = await tx<{ id: number }[]>`
        INSERT INTO providers (slug, name, website, api_docs_url, type, region, currency, access_from_china, notes)
        VALUES (${META_PROVIDER.slug}, ${META_PROVIDER.name}, ${META_PROVIDER.website}, ${META_PROVIDER.sourceUrl},
                'official', 'global', 'USD', false, ${sourceNotes(META_PROVIDER)})
        ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
        RETURNING id
      `;
      providerIds.set(META_PROVIDER.slug, provider.id);
    }
    const metaId = providerIds.get(META_PROVIDER.slug)!;
    const modelIds = new Map<string, number>();
    for (const seed of VERIFIED_MODELS) {
      const [model] = await tx<{ id: number }[]>`
        INSERT INTO models (slug, name, type, model_category, context_window, open_source,
                            provider_ids, pricing_unit, description, offical_link)
        VALUES (${seed.slug}, ${seed.name}, 'llm', 'text', ${seed.contextWindow}, ${seed.openSource},
                ${tx.array([metaId], 1007)}, ${seed.subscriptionOnly ? 'unknown' : 'per_1m_tokens'},
                ${sourceNotes(seed)}, ${seed.sourceUrl})
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name, type = EXCLUDED.type, model_category = EXCLUDED.model_category,
          context_window = EXCLUDED.context_window, open_source = EXCLUDED.open_source,
          provider_ids = ARRAY(SELECT DISTINCT unnest(coalesce(models.provider_ids, '{}') || EXCLUDED.provider_ids)),
          pricing_unit = EXCLUDED.pricing_unit, description = EXCLUDED.description,
          offical_link = EXCLUDED.offical_link, updated_at = now()
        RETURNING id
      `;
      modelIds.set(seed.slug, model.id);
      await tx`
        INSERT INTO model_offical (model_id, producer_id)
        SELECT ${model.id}, ${metaId}
        WHERE NOT EXISTS (SELECT 1 FROM model_offical WHERE model_id = ${model.id} AND producer_id = ${metaId})
      `;
      console.log(`Upsert model: meta/${seed.slug}`);
    }

    for (const seed of VERIFIED_API_PRICES) {
      const modelId = modelIds.get(seed.modelSlug)!;
      const existing = await tx<{ id: number }[]>`
        SELECT id FROM api_channel_prices WHERE provider_id = ${metaId} AND model_id = ${modelId}
      `;
      if (existing.length > 1) throw new Error(`Duplicate API channel prices for ${seed.modelSlug}`);
      const row = {
        provider_id: metaId, model_id: modelId, input_price_per_1m: seed.inputPricePer1m,
        cached_input_price_per_1m: seed.cachedInputPricePer1m, output_price_per_1m: seed.outputPricePer1m,
        currency: seed.currency, price_unit: seed.priceUnit, is_available: true,
        notes: sourceNotes(seed), last_verified: seed.lastVerified, updated_at: new Date(),
      };
      if (existing.length) await tx`UPDATE api_channel_prices SET ${tx(row)} WHERE id = ${existing[0].id}`;
      else await tx`INSERT INTO api_channel_prices ${tx(row)}`;
      console.log(`Upsert official API channel: meta/${seed.modelSlug}`);
    }

    const catalog: SelectableModel[] = VERIFIED_MODELS.map((seed) => ({
      id: modelIds.get(seed.slug)!, slug: seed.slug, providerSlugs: [seed.providerSlug], elo: null,
    }));
    for (const seed of VERIFIED_PLANS) {
      const providerId = providerIds.get(seed.providerSlug)!;
      const existing = await tx<{ id: number }[]>`
        SELECT id FROM plans WHERE provider_id = ${providerId} AND slug = ${seed.slug}
      `;
      if (existing.length > 1) throw new Error(`Duplicate plan identity: ${seed.providerSlug}/${seed.slug}`);
      const payload = planRow(seed, providerId);
      const row = {
        ...payload, features: tx.json(seed.features), quotas: tx.json(seed.quotas),
        model_selector: seed.modelSelector ? tx.json(seed.modelSelector) : null,
        secondary_kinds: tx.array(seed.secondaryKinds, 1009), updated_at: new Date(),
      };
      const [plan] = existing.length
        ? await tx<{ id: number }[]>`UPDATE plans SET ${tx(row)} WHERE id = ${existing[0].id} RETURNING id`
        : await tx<{ id: number }[]>`INSERT INTO plans ${tx(row)} RETURNING id`;

      const resolution = resolveSelector(seed.modelSelector, catalog, [seed.providerSlug]);
      if (resolution.unknownExtra.length) throw new Error(`Unknown models for ${seed.slug}: ${resolution.unknownExtra.join(', ')}`);
      for (const [priority, model] of resolution.models.entries()) {
        await tx`
          INSERT INTO model_plan_mapping (model_id, plan_id, priority, source)
          VALUES (${model.id}, ${plan.id}, ${priority}, 'derived')
          ON CONFLICT (plan_id, model_id) DO NOTHING
        `;
      }
      console.log(`Upsert plan: ${seed.providerSlug}/${seed.slug} USD ${seed.price}/month`);
    }

    const legacyPlans = await tx<{
      id: number; provider_slug: string; slug: string; name: string; notes: string | null; features: unknown;
    }[]>`
      SELECT plan.id, provider.slug AS provider_slug, plan.slug, plan.name, plan.notes, plan.features
      FROM plans AS plan JOIN providers AS provider ON provider.id = plan.provider_id
      WHERE provider.slug = ANY(${tx.array([...new Set(LEGACY_CLOSURE.rules.flatMap((rule) => rule.providerSlugs))], 1009)})
      FOR UPDATE OF plan
    `;
    let closed = 0;
    for (const plan of legacyPlans) {
      if (!matchesLegacyPlan(plan.provider_slug, plan.slug, plan.name)) continue;
      const patch = legacyPlanPatch(plan.notes, plan.features);
      await tx`
        UPDATE plans SET notes = ${patch.notes}, features = ${tx.json(patch.features)},
                         last_verified = ${LAST_VERIFIED}, updated_at = now()
        WHERE id = ${plan.id}
      `;
      closed++;
      console.log(`Keep and close to new users: ${plan.provider_slug}/${plan.slug}`);
    }
    console.log(`Seeded ${VERIFIED_PLANS.length} plans, ${VERIFIED_MODELS.length} models, ${VERIFIED_API_PRICES.length} API channel; marked ${closed} legacy plans.`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !['--apply', '--dry-run', '--help'].includes(arg));
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('Use either --apply or --dry-run.');
  if (args.includes('--help')) {
    console.log('Usage: tsx scripts/seed-2026-10-13.ts [--dry-run | --apply]\nDefault: print offline manifest; --apply requires DATABASE_URL.');
    return;
  }
  if (!args.includes('--apply')) {
    console.log('seed-2026-10-13 [DRY-RUN / OFFLINE] — no DB client loaded; existing row counts are unknown.');
    console.log(JSON.stringify({
      provider: { ...META_PROVIDER, notes: sourceNotes(META_PROVIDER) },
      models: VERIFIED_MODELS,
      apiChannelPrices: VERIFIED_API_PRICES,
      plans: VERIFIED_PLANS.map((seed) => ({ ...planRow(seed, 0), provider_id: undefined, product_id: undefined, providerSlug: seed.providerSlug })),
      legacyPlanUpdates: LEGACY_CLOSURE,
      skipped: ['GLM-Legal: no public price'],
    }, null, 2));
    return;
  }
  const { databaseSql } = await import('./db/postgres-admin');
  try { await applySeed(databaseSql); }
  finally { await databaseSql.end(); }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
