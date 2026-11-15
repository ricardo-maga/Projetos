export function safeLogoSource(value: string): string {
  const inlineSvg = value.startsWith('<svg') || value.startsWith('<?xml') || value.toLowerCase().includes('<svg');
  if (inlineSvg) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  if (/^https?:\/\//i.test(value) || /^data:image\/(?:svg\+xml|png|jpeg|webp);/i.test(value) ||
    (value.startsWith('/') && !value.startsWith('//'))) return value;
  return '';
}
