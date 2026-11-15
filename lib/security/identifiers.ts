const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts the application's historical UUID-shaped identifiers as well as RFC UUIDs. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

/** Route IDs may be short legacy identifiers; reject PostgREST syntax and oversized values. */
export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
