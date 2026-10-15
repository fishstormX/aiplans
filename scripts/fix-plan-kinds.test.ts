import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from './config/canonical-json';

test('canonicalJson ignores jsonb key order', () => {
  assert.equal(
    canonicalJson({ families: ['gemini'], exclude: ['a'], current_only: true }),
    canonicalJson({ current_only: true, exclude: ['a'], families: ['gemini'] }),
  );
  assert.notEqual(canonicalJson({ families: ['a', 'b'] }), canonicalJson({ families: ['b', 'a'] }));
});
