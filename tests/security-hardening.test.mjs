import test from 'node:test';
import assert from 'node:assert/strict';
import { quotedLikePattern, orLike } from '../lib/security/postgrestSearch.ts';
import { hasImageSignature } from '../lib/security/imageSignature.ts';
import { clientIp } from '../lib/security/clientIp.ts';
import { quotaResponse, quotaUnavailable } from '../lib/security/edgeRateLimit.ts';
import { safeLogoSource } from '../lib/security/logoSource.ts';
import { isSafeIdentifier, isUuid } from '../lib/security/identifiers.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

test('PostgREST search keeps reserved characters inside one value', () => {
  assert.equal(quotedLikePattern(' a,b")or(id.eq.1 '), '"%a,b\\")or(id.eq.1%"');
  assert.equal(orLike(['title', 'notes'], '100%_'),
    'title.ilike."%100\\%\\_%",notes.ilike."%100\\%\\_%"');
  assert.throws(() => quotedLikePattern('a\nfoo'));
  assert.throws(() => quotedLikePattern('x'.repeat(101)));
});

test('route identifiers reject filter syntax while preserving short legacy IDs', () => {
  assert.equal(isSafeIdentifier('non-existent-id'), true);
  assert.equal(isSafeIdentifier('project_1'), true);
  assert.equal(isSafeIdentifier('x'.repeat(65)), false);
  assert.equal(isSafeIdentifier('a,or(id.eq.1)'), false);
  assert.equal(isUuid('10000000-0000-0000-0000-000000000001'), true);
});

test('image signatures must match declared media type', () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const jpeg = Uint8Array.from([255, 216, 255, 224]);
  const webp = Uint8Array.from(Buffer.from('RIFF1234WEBP'));
  assert.equal(hasImageSignature(png, 'image/png'), true);
  assert.equal(hasImageSignature(jpeg, 'image/jpeg'), true);
  assert.equal(hasImageSignature(webp, 'image/webp'), true);
  assert.equal(hasImageSignature(Buffer.from('<svg onload="x">'), 'image/png'), false);
  assert.equal(hasImageSignature(png, 'image/svg+xml'), false);
  assert.equal(hasImageSignature(jpeg, 'image/png'), false);
});

test('inline SVG is confined to an image URL and unsafe schemes are rejected', () => {
  const svg = '<svg onload="alert(1)"></svg>';
  assert.equal(safeLogoSource(svg), `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  assert.equal(safeLogoSource('javascript:alert(1)'), '');
  assert.equal(safeLogoSource('//evil.example/logo.svg'), '');
  assert.equal(safeLogoSource('/logo.svg'), '/logo.svg');
});

test('comment Markdown strips script, event handlers, and unsafe links', () => {
  const markup = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    rehypePlugins: [rehypeRaw, rehypeSanitize],
    allowedElements: ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'u', 'del', 'ul', 'ol', 'li', 'a', 'br'],
  }, '<script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">open</a>'));
  assert.equal(markup.includes('<script'), false);
  assert.equal(markup.includes('onerror'), false);
  assert.equal(markup.includes('javascript:'), false);
  assert.match(markup, /open/);
});

test('client IP ignores spoofed forwarding headers outside trusted ingress', () => {
  const oldVercel = process.env.VERCEL_ENV;
  const oldProxy = process.env.TRUST_PROXY_IP_HEADERS;
  try {
    delete process.env.VERCEL_ENV;
    delete process.env.TRUST_PROXY_IP_HEADERS;
    const req = new Request('https://example.test/api/x', { headers: {
      'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8',
    } });
    assert.equal(clientIp(req), 'unknown');
    process.env.VERCEL_ENV = 'production';
    assert.equal(clientIp(new Request(req.url, { headers: {
      'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '9.8.7.6',
    } })), '9.8.7.6');
  } finally {
    if (oldVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldVercel;
    if (oldProxy === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
    else process.env.TRUST_PROXY_IP_HEADERS = oldProxy;
  }
});

test('quota failures use 429 and Retry-After; unavailable storage uses 503', async () => {
  const exceeded = quotaResponse({ success: false, resetAt: Date.now() + 30000 }, 'request-1');
  assert.equal(exceeded.status, 429);
  assert.ok(Number(exceeded.headers.get('Retry-After')) >= 1);
  assert.equal((await exceeded.json()).error.code, 'TOO_MANY_REQUESTS');
  assert.equal(quotaResponse({ success: true, resetAt: Date.now() }, 'request-1'), null);
  assert.equal(quotaUnavailable('request-1').status, 503);
});
