type ProviderLike = {
  slug?: string | null;
  name?: string | null;
  logo?: string | null;
  logoUrl?: string | null;
  logo_url?: string | null;
};

const PROVIDER_EMOJI: Record<string, string> = {
  openai: '🤖',
  anthropic: '🧠',
  google: '✨',
  deepseek: '🔍',
  mistral: '🌪️',
  xai: '🤠',
  meta: '🦙',
  qwen: '🐱',
  volcengine: '🔥',
  seed: '🌋',
  moonshot: '🌙',
  zhipu: '⚡',
  'zhipu-china': '⚡',
  'zhipu-global': '⚡',
  baidu: '☁️',
  minimax: '🎯',
};

// Bundled official favicons (fetched once from each vendor's own site via a
// favicon resolver and committed under public/providers) for providers whose
// DB row has no logo. A DB logo always wins; this is only the fallback.
export const LOCAL_PROVIDER_LOGOS: Record<string, string> = {
  'alibaba-ath': '/providers/alibaba-ath.ico',
  'bfl': '/providers/bfl.png',
  'cohere': '/providers/cohere.ico',
  'decart': '/providers/decart.ico',
  'genmo': '/providers/genmo.png',
  'ibm-granite': '/providers/ibm-granite.ico',
  'inception': '/providers/inception.ico',
  'inclusionai': '/providers/inclusionai.ico',
  'inference-net': '/providers/inference-net.ico',
  'kandinsky': '/providers/kandinsky.png',
  'liquid': '/providers/liquid.ico',
  'manus': '/providers/manus.ico',
  'moonshot': '/providers/moonshot.ico',
  'nex-agi': '/providers/nex-agi.png',
  'noiz-ai': '/providers/noiz-ai.ico',
  'odyssey': '/providers/odyssey.png',
  'perceptron': '/providers/perceptron.png',
  'pixverse': '/providers/pixverse.ico',
  'prism-ml': '/providers/prism-ml.ico',
  'sakana': '/providers/sakana.ico',
  'scaledown': '/providers/scaledown.ico',
  'skywork': '/providers/skywork.ico',
  'subq': '/providers/subq.png',
  'tencent': '/providers/tencent.ico',
  'typesafe': '/providers/typesafe.ico',
  'unbiased': '/providers/unbiased.jpg',
  'upstage': '/providers/upstage.png',
  'vercel-ai-gateway': '/providers/vercel-ai-gateway.png',
  'xiaomi': '/providers/xiaomi.ico',
};

function looksLikeImageSource(value?: string | null): boolean {
  if (!value) return false;
  return /^(https?:)?\/\//.test(value) || value.startsWith('/') || value.startsWith('data:image/');
}

export function getProviderLogoSrc(provider?: ProviderLike | null): string | null {
  if (!provider) return null;
  const candidates = [provider.logoUrl, provider.logo_url, provider.logo];
  return candidates.find((value) => looksLikeImageSource(value))
    || (provider.slug ? LOCAL_PROVIDER_LOGOS[provider.slug] : undefined)
    || null;
}

export function getProviderLogoFallback(provider?: ProviderLike | null, fallback = '🏢'): string {
  if (!provider) return fallback;
  if (provider.logo && !looksLikeImageSource(provider.logo)) {
    return provider.logo;
  }
  if (provider.slug && PROVIDER_EMOJI[provider.slug]) {
    return PROVIDER_EMOJI[provider.slug];
  }
  return fallback;
}

/** One or two letters for the initials avatar shown when no logo loads. */
export function getProviderInitials(provider?: ProviderLike | null): string {
  const source = (provider?.name || provider?.slug || '').trim();
  if (!source) return '?';
  const words = source.split(/[\s\-_.+]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : [...words[0]].slice(0, 2).join('');
  return letters.toUpperCase();
}
