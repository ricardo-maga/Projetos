import { expect, test } from 'bun:test';
import { decodeProjectCursor, encodeProjectCursor } from '../domains/projects/contracts/projectListCursor';
import { isNotModified, mutationPrecondition, resourceTag } from '../lib/security/resourceVersion';
import { createRecoveryGrant, signRecoveryVerifier, validRecoveryGrant, verifiedRecoveryVerifier } from '../lib/auth/passwordRecovery';

test('project cursors preserve Postgres timestamp precision and are bound to their sort order', () => {
  const cursor = {
    id: '10000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-23T04:05:06.123456+00:00', sort: '-createdAt' as const,
  };
  const encoded = encodeProjectCursor(cursor);
  expect(decodeProjectCursor(encoded, cursor.sort)).toEqual(cursor);
  expect(decodeProjectCursor(encoded, 'createdAt')).toBeNull();
  expect(decodeProjectCursor('not-a-cursor', cursor.sort)).toBeNull();
});

test('HTTP validators distinguish weak cache tags, failed If-Match and body version conflicts', () => {
  const tag = resourceTag({ id: 'id', version: 2 });
  const read = new Request('http://localhost', { headers: { 'If-None-Match': `W/${tag}` } });
  expect(isNotModified(read, tag)).toBe(true);
  const write = new Request('http://localhost', { method: 'PUT', headers: { 'If-Match': `W/${tag}` } });
  expect(mutationPrecondition(write, tag, undefined, 2, 'request')?.status).toBe(412);
  expect(mutationPrecondition(new Request('http://localhost'), tag, 1, 2, 'request')?.status).toBe(409);
});

test('a recovery proof is bound to the verifier, the authentication identity and the recovery session', () => {
  const existing = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = 'test-only-secret';
  try {
    const verifier = { name: 'erp-recovery-auth-token-code-verifier', value: 'verifier' };
    const proof = signRecoveryVerifier(verifier)!;
    expect(verifiedRecoveryVerifier(proof, [verifier], null)).toBe(true);
    expect(verifiedRecoveryVerifier(proof, [{ ...verifier, value: 'different' }], null)).toBe(false);
    expect(verifiedRecoveryVerifier(proof, [verifier], 'different-flow')).toBe(false);
    const grant = createRecoveryGrant('user', 'session')!;
    expect(validRecoveryGrant(grant, 'user', 'session')).toBe(true);
    expect(validRecoveryGrant(grant, 'user', 'other-session')).toBe(false);
    expect(validRecoveryGrant(grant, 'other-user', 'session')).toBe(false);
  } finally {
    if (existing === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = existing;
  }
});
