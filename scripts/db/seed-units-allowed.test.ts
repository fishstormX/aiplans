import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NON_LLM_CATALOG } from '../../src/lib/non-llm-catalog';
import { IMAGE_MODEL_CATALOG } from '../../src/lib/image-model-catalog';
import { AI_VERTICAL_CATALOG } from '../../src/lib/ai-vertical-catalog';
import { auditVerticalModelFields, isAuditOwnedVertical } from '../data/catalog-audit-vertical';

// models_pricing_unit_chk as created outside this repo (production, before 035).
const BASELINE = ['per_1m_tokens', 'per_second', 'per_minute', 'per_generation', 'per_credit', 'per_compute_hour', 'subscription_only', 'unknown'];
// Unit migrations registered in migrate-data-accuracy.ts; each appends its FOREACH ARRAY[...] values.
const UNIT_MIGRATIONS = ['0010_allow_per_hour_unit.sql', '0011_allow_per_image_unit.sql'];

function allowedUnits(): Set<string> {
  const runner = readFileSync(new URL('../migrate-data-accuracy.ts', import.meta.url), 'utf8');
  const allowed = new Set(BASELINE);
  for (const file of UNIT_MIGRATIONS) {
    assert.ok(runner.includes(`../drizzle/${file}`), `${file} is registered in migrate-data-accuracy.ts`);
    const sql = readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');
    const list = sql.match(/FOREACH v IN ARRAY ARRAY\[([^\]]+)\]/)?.[1];
    assert.ok(list, `${file} has a FOREACH unit list`);
    for (const m of list.matchAll(/'([^']+)'/g)) allowed.add(m[1]);
  }
  return allowed;
}

test('every models.pricing_unit used by image, non-llm and catalog-audit seeds is allowed by migrations', () => {
  const allowed = allowedUnits();
  const used = new Map<string, string>();
  for (const item of [...NON_LLM_CATALOG, ...IMAGE_MODEL_CATALOG]) if (item.pricingUnit) used.set(item.pricingUnit, item.slug ?? item.name);
  for (const item of AI_VERTICAL_CATALOG.filter(isAuditOwnedVertical)) used.set(auditVerticalModelFields(item).pricing_unit, item.slug ?? item.name);
  const rejected = [...used].filter(([unit]) => !allowed.has(unit)).map(([unit, eg]) => `${unit} (e.g. ${eg})`);
  assert.deepEqual(rejected, [], `seed units missing from unit migrations: ${rejected.join(', ')}`);
  assert.ok(used.has('per_image'));
});
