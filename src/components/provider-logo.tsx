"use client";

import { useState } from 'react';
import { getProviderInitials, getProviderLogoSrc } from '@/lib/provider-branding';

type ProviderLogoProps = {
  provider?: { slug?: string | null; name?: string | null; logo?: string | null; logo_url?: string | null; logoUrl?: string | null } | null;
  /** Square size in px. */
  size?: number;
  className?: string;
};

/**
 * Provider logo with an initials avatar fallback. A missing logo or one that
 * fails to load (dead favicon, blocked host) never renders as a broken image.
 */
export function ProviderLogo({ provider, size = 48, className = '' }: ProviderLogoProps) {
  const src = getProviderLogoSrc(provider);
  const [failed, setFailed] = useState(false);
  const name = provider?.name || provider?.slug || '';
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-contain shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-100 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {getProviderInitials(provider)}
    </span>
  );
}
