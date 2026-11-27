export const COLOR_SCHEMES = [
  { id: 'domino', name: 'Domino Institucional', description: 'Paleta oficial Domino', swatch: '#003b5c' },
  { id: 'blue', name: 'Azul Clássico', description: 'Padrão original azul', swatch: '#2563eb' },
  { id: 'emerald', name: 'Verde Esmeralda', description: 'Moderno e sofisticado', swatch: '#059669' },
  { id: 'violet', name: 'Violeta Elegante', description: 'Design criativo', swatch: '#7c3aed' },
  { id: 'amber', name: 'Âmbar Solar', description: 'Quente e acolhedor', swatch: '#d97706' },
  { id: 'slate', name: 'Cinzento Minimal', description: 'Industrial e limpo', swatch: '#475569' },
  { id: 'rose', name: 'Rosa Coral', description: 'Vibrante e inovador', swatch: '#e11d48' },
] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export type ColorSchemeId = ColorScheme['id'];
export type ApplicationTheme = ColorSchemeId | 'default';
export const COLOR_SCHEME_IDS = COLOR_SCHEMES.map(scheme => scheme.id);

export function normalizePreferredTheme(value: unknown): ColorSchemeId | null {
  return COLOR_SCHEMES.find(scheme => scheme.id === value)?.id ?? null;
}

export function normalizeApplicationTheme(value: unknown): ApplicationTheme | null {
  return value === 'default' ? value : normalizePreferredTheme(value);
}

/** The bootstrap baseline does not represent a loaded application configuration. */
export function getPresentationTheme(
  loaded: boolean,
  privateTheme?: unknown,
  publicTheme?: unknown,
  cachedTheme?: unknown,
): ApplicationTheme {
  const configured = (loaded ? normalizeApplicationTheme(privateTheme) : null) ?? normalizeApplicationTheme(publicTheme);
  if (configured) return configured;
  if (loaded || publicTheme != null) return 'default';
  return normalizeApplicationTheme(cachedTheme) ?? 'default';
}
