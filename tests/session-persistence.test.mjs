import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authCookieLifetime, sessionPreference } from '../lib/auth/sessionPersistence.ts';

test('a sessão sem lembrar termina com o navegador, mesmo após renovar cookies', () => {
  const preference = sessionPreference(false);
  assert.deepEqual(authCookieLifetime(preference), { maxAge: undefined, expires: undefined });
});

test('lembrar login mantém um limite fixo de 30 dias após renovações', () => {
  const start = Date.UTC(2026, 10, 1);
  const preference = sessionPreference(true, start);
  assert.equal(authCookieLifetime(preference, start).maxAge, 30 * 24 * 60 * 60);
  assert.equal(authCookieLifetime(preference, start + 10 * 24 * 60 * 60 * 1000).maxAge, 20 * 24 * 60 * 60);
  assert.equal(authCookieLifetime(preference, start + 31 * 24 * 60 * 60 * 1000).maxAge, 0);
});
