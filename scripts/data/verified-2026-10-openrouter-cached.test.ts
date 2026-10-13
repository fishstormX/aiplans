import assert from 'node:assert/strict';
import test from 'node:test';
import { OPENROUTER_FLOOR_PRICES } from './verified-2026-10-chatgpt-pro-openrouter';

test('OpenRouter floor seeds: cached input never above input', () => {
  for (const f of OPENROUTER_FLOOR_PRICES) {
    assert.ok(f.cachedInputPer1m === null || f.cachedInputPer1m <= f.inputPer1m, f.openRouterId);
  }
});
