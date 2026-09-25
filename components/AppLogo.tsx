'use client';

import React, { useState, useEffect } from 'react';
import { Briefcase } from 'lucide-react';

interface AppLogoProps {
  logoUrl?: string;
  appName?: string;
  className?: string;
  fallbackIconClassName?: string;
}

export default function AppLogo({
  logoUrl,
  appName = '',
  className = 'w-72 h-10 bg-transparent',
  fallbackIconClassName = 'w-4 h-4 text-white',
}: AppLogoProps) {
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
  const [svgContent, setSvgContent] = useState<string | null>(null);

  const isInlineSvg = cleanLogo.startsWith('<svg') || cleanLogo.startsWith('<?xml') || cleanLogo.toLowerCase().includes('<svg');
  const isSvgUrl = !isInlineSvg && (cleanLogo.toLowerCase().endsWith('.svg') || cleanLogo.toLowerCase().includes('.svg?'));

  // Reset error and fetch SVG text if it's an SVG URL
  useEffect(() => {
    setImageError(false);
    setSvgContent(null);

    // If it's an SVG URL, try to fetch the raw SVG text so it renders seamlessly without img/cross-origin restrictions
    if (isSvgUrl && (cleanLogo.startsWith('http://') || cleanLogo.startsWith('https://') || cleanLogo.startsWith('/'))) {
      let active = true;
      fetch(cleanLogo, { mode: 'cors' })
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch SVG');
          return res.text();
        })
        .then(text => {
          if (active && text && (text.includes('<svg') || text.includes('<?xml'))) {
            setSvgContent(text);
          }
        })
        .catch(() => {
          // Fallback to img tag if fetch fails
        });
      return () => { active = false; };
    }
  }, [cleanLogo, isSvgUrl]);

  // Helper to extract clean initials or acronym for fallback badge
  const appWords = (appName || '').trim().split(/\s+/).filter(Boolean);
  const badgeText = appWords.length > 1 
    ? (appWords[0].charAt(0) + appWords[1].charAt(0)).toUpperCase()
    : (appName ? appName.slice(0, 3).toUpperCase() : '');

  if (!cleanLogo || (imageError && !svgContent)) {
    return (
      <div className={`${className} bg-blue-600 flex items-center justify-center text-white font-extrabold shrink-0 select-none overflow-hidden px-3 gap-2 shadow-2xs`}>
        <Briefcase className={fallbackIconClassName} />
        {badgeText ? (
          <span className="leading-none text-xs font-black tracking-wider uppercase truncate">
            {badgeText}
          </span>
        ) : null}
      </div>
    );
  }

  // 1. Inline SVG or fetched SVG text
  const svgToRender = isInlineSvg ? cleanLogo : svgContent;
  if (svgToRender) {
    return (
      <div 
        className={`${className} flex items-center justify-center shrink-0 overflow-hidden [&_svg]:w-full [&_svg]:h-full [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:object-contain`}
        dangerouslySetInnerHTML={{ __html: svgToRender }}
      />
    );
  }

  // 2. Standard Image URL, relative path (/logo.svg), data URI (data:image/svg+xml...) or SVG/PNG/JPG/WEBP URL
  return (
    <div className={`${className} flex items-center justify-center shrink-0 overflow-hidden relative`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={cleanLogo}
        src={cleanLogo}
        alt={appName}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImageError(true)}
        className="w-full h-full object-contain object-center"
      />
    </div>
  );
}
