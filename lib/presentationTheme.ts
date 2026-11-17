/** The bootstrap baseline is not an authenticated theme preference. */
export function getPresentationTheme(loaded: boolean, privateTheme?: string, publicTheme?: string, cachedTheme?: string | null): string {
  return (loaded ? privateTheme : undefined) || publicTheme || cachedTheme || 'default';
}
