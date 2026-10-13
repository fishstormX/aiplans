import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHATGPT_PRO_PLANS,
  OPENROUTER_FLOOR_PRICES,
  LEGACY_CHATGPT_PRO_SLUG,
  CHATGPT_PRO_SUPERSEDED_MARKER,
} from './verified-2026-10-chatgpt-pro-openrouter';

test('ChatGPT Pro is three monthly tiers at 100 / 200 / 500', () => {
  assert.deepEqual(
    CHATGPT_PRO_PLANS.map((p) => [p.slug, p.price, p.tierRank]),
    [
      ['chatgpt-pro-100', 100, 3],
      ['chatgpt-pro-200', 200, 4],
      ['chatgpt-pro-500', 500, 5],
    ],
  );
  for (const p of CHATGPT_PRO_PLANS) {
    assert.equal(p.providerSlug, 'openai');
    assert.equal(p.planLine, 'chatgpt');
    assert.equal(p.tier, 'pro');
    assert.ok(p.sourceUrl.includes('9793128'));
  }
  assert.ok(CHATGPT_PRO_PLANS[2].features.some((f) => /Ultrafast/i.test(f)));
  assert.ok(CHATGPT_PRO_PLANS[1].noteLines.some((n) => /2026-10-29|October 29/i.test(n)));
});

test('legacy chatgpt-pro slug is distinct from the three new rungs', () => {
  assert.equal(LEGACY_CHATGPT_PRO_SLUG, 'chatgpt-pro');
  assert.ok(!CHATGPT_PRO_PLANS.some((p) => p.slug === LEGACY_CHATGPT_PRO_SLUG));
  assert.ok(CHATGPT_PRO_SUPERSEDED_MARKER.includes('chatgpt-pro-100'));
});

test('OpenRouter floors match verified official endpoints', () => {
  const byId = Object.fromEntries(OPENROUTER_FLOOR_PRICES.map((r) => [r.openRouterId, r]));
  assert.equal(byId['openai/gpt-oss-120b'].inputPer1m, 0.03);
  assert.equal(byId['openai/gpt-oss-120b'].outputPer1m, 0.15);
  assert.equal(byId['openai/gpt-oss-120b'].floorProvider, 'Venice');
  assert.equal(byId['qwen/qwen3.8-27b'].inputPer1m, 0.02);
  assert.equal(byId['qwen/qwen3.8-27b'].outputPer1m, 0.5);
  assert.equal(byId['qwen/qwen3.8-27b'].floorProvider, 'Tenstorrent');
  assert.equal(byId['qwen/qwen3.6-35b-a3b'].inputPer1m, 0.05);
  assert.equal(byId['qwen/qwen3.6-35b-a3b'].outputPer1m, 0.7);
  assert.equal(byId['google/gemma-4-26b-a4b-it'].inputPer1m, 0.042);
  assert.equal(byId['google/gemma-4-26b-a4b-it'].outputPer1m, 0.22);
  assert.equal(byId['nvidia/nemotron-3-super-120b-a12b'].inputPer1m, 0.08);
  assert.equal(byId['nvidia/nemotron-3-super-120b-a12b'].outputPer1m, 0.45);
  assert.equal(byId['nvidia/nemotron-3.5-lightning'].inputPer1m, 0.025);
  assert.equal(byId['nvidia/nemotron-3.5-lightning'].outputPer1m, 0.12);
  assert.equal(OPENROUTER_FLOOR_PRICES.length, 6);
  for (const r of OPENROUTER_FLOOR_PRICES) {
    assert.ok(r.verified);
    assert.ok(r.sourceUrl.startsWith('https://openrouter.ai/'));
    assert.ok(r.modelSlugCandidates.length >= 1);
  }
});
