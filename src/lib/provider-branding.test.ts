import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getProviderInitials, getProviderLogoSrc, LOCAL_PROVIDER_LOGOS } from './provider-branding';

test('DB logo wins over bundled logo', () => {
  assert.equal(getProviderLogoSrc({ slug: 'cohere', logo_url: '/x.svg' }), '/x.svg');
  assert.equal(getProviderLogoSrc({ slug: 'cohere' }), LOCAL_PROVIDER_LOGOS.cohere);
  assert.equal(getProviderLogoSrc({ slug: 'no-such-provider' }), null);
});

test('every bundled logo file exists', () => {
  for (const path of Object.values(LOCAL_PROVIDER_LOGOS)) assert.ok(existsSync(`public${path}`), path);
});

test('initials', () => {
  assert.equal(getProviderInitials({ name: 'Vercel AI Gateway' }), 'VA');
  assert.equal(getProviderInitials({ name: 'xiaomi' }), 'XI');
  assert.equal(getProviderInitials({ slug: 'aion-labs' }), 'AL');
  assert.equal(getProviderInitials(null), '?');
});
