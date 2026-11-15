'use client';

import React, { useState, useEffect } from 'react';
import { Briefcase } from 'lucide-react';
import { safeLogoSource } from '@/lib/security/logoSource';

interface AppLogoProps {
  logoUrl?: string;
  appName?: string;
  className?: string;
  fallbackIconClassName?: string;
  busy?: boolean;
  result?: 'synced' | 'error' | null;
}

export default function AppLogo({
  logoUrl,
  appName = '',
  className = 'w-72 h-10 bg-transparent',
  fallbackIconClassName = 'w-4 h-4 text-white',
  busy = false,
  result = null,
}: AppLogoProps) {
  const logoClassName = `${className}${busy ? ' app-logo--busy' : result ? ` app-logo--${result}` : ''}`;
  // Normalize logo input
  let cleanLogo = (logoUrl || '').trim();
  // Strip enclosing quotes if user pasted "https://..."
  if ((cleanLogo.startsWith('"') && cleanLogo.endsWith('"')) || (cleanLogo.startsWith("'") && cleanLogo.endsWith("'"))) {
    cleanLogo = cleanLogo.slice(1, -1).trim();
  }

  // If local file path without leading slash, e.g. "logo.svg" or "public/logo.svg"
  if (cleanLogo && !cleanLogo.startsWith('http://') && !cleanLogo.startsWith('https://') && !cleanLogo.startsWith('data:') && !cleanLogo.startsWith('/') && !cleanLogo.startsWith('<')) {
    if (cleanLogo.startsWith('public/')) {
      cleanLogo = '/' + cleanLogo.replace(/^public\//, '');
    } else {
      cleanLogo = '/' + cleanLogo;
    }
  }

  const [imageError, setImageError] = useState(false);
  // SVG remains an image document, never HTML in the application's DOM.
  const safeLogoSrc = safeLogoSource(cleanLogo);
  useEffect(() => setImageError(false), [safeLogoSrc]);

  // Helper to extract clean initials or acronym for fallback badge
  const appWords = (appName || '').trim().split(/\s+/).filter(Boolean);
  const badgeText = appWords.length > 1 
    ? (appWords[0].charAt(0) + appWords[1].charAt(0)).toUpperCase()
    : (appName ? appName.slice(0, 3).toUpperCase() : '');

  if (!safeLogoSrc || imageError) {
    return (
      <div className={`${logoClassName} relative bg-blue-600 flex items-center justify-center text-white font-extrabold shrink-0 select-none overflow-hidden px-3 gap-2 shadow-2xs`}>
        <Briefcase className={fallbackIconClassName} />
        {badgeText ? (
          <span className="leading-none text-xs font-black tracking-wider uppercase truncate">
            {badgeText}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${logoClassName} flex items-center justify-center shrink-0 overflow-hidden relative`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={safeLogoSrc}
        src={safeLogoSrc}
        alt={appName}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImageError(true)}
        className="w-full h-full object-contain object-center"
      />
    </div>
  );
}
