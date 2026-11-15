/** Quote one user-supplied ILIKE pattern inside PostgREST's raw `.or()` syntax. */
export function quotedLikePattern(search: string): string {
  const value = search.trim();
  if (value.length > 100 || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error('Invalid search term.');
  // The outer percent signs provide substring matching; user wildcards remain literal.
  return `"%${value.replace(/[\\"%_]/g, character => `\\${character}`)}%"`;
}

export function orLike(columns: readonly string[], search: string): string {
  const pattern = quotedLikePattern(search);
  return columns.map(column => `${column}.ilike.${pattern}`).join(',');
}
