'use client';

import React, { useState } from 'react';
import { Briefcase } from 'lucide-react';

interface AppLogoProps {
  logoUrl?: string;
  appName?: string;
  className?: string;
  fallbackIconClassName?: string;
}

export default function AppLogo({
  logoUrl,
  appName = 'Portal',
  className = 'w-24 h-8 rounded-lg',
  fallbackIconClassName = 'w-4 h-4 text-white',
}: AppLogoProps) {
  const [imageError, setImageError] = useState(false);
  const [prevLogo, setPrevLogo] = useState(logoUrl);

  if (prevLogo !== logoUrl) {
    setPrevLogo(logoUrl);
    setImageError(false);
  }

  const cleanLogo = logoUrl ? logoUrl.trim() : '';

  // Helper to extract clean initials or acronym for fallback badge
  const appWords = (appName || 'Portal').trim().split(/\s+/);
  const badgeText = appWords.length > 1 
    ? (appWords[0].charAt(0) + appWords[1].charAt(0)).toUpperCase()
    : appName.slice(0, 3).toUpperCase();

  if (!cleanLogo || imageError) {
    return (
      <div className={`${className} bg-blue-600 flex items-center justify-center text-white font-extrabold shrink-0 select-none overflow-hidden px-2 gap-1.5 shadow-2xs`}>
        <Briefcase className={fallbackIconClassName} />
        <span className="leading-none text-[11px] font-black tracking-wider uppercase truncate">
          {badgeText}
        </span>
      </div>
    );
  }

  // Check if logo is inline SVG code (e.g. starts with <svg or contains <svg)
  if (cleanLogo.startsWith('<svg') || cleanLogo.startsWith('<?xml') || cleanLogo.toLowerCase().includes('<svg')) {
    return (
      <div 
        className={`${className} flex items-center justify-center shrink-0 overflow-hidden [&_svg]:w-full [&_svg]:h-full [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:object-contain`}
        dangerouslySetInnerHTML={{ __html: cleanLogo }}
      />
    );
  }

  // Standard Image URL, relative path (/logo.svg), data URI (data:image/svg+xml...) or SVG/PNG/JPG/WEBP URL
  return (
    <div className={`${className} flex items-center justify-center shrink-0 overflow-hidden relative`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={cleanLogo}
        src={cleanLogo}
        alt={appName}
        onError={() => setImageError(true)}
        className="w-full h-full object-contain object-center"
      />
    </div>
  );
}
