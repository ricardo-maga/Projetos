import { expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { hasSameRequestOrigin } from '../lib/security/requestOrigin';

it('accepts the actual loopback destination even when NextURL normalizes it to localhost', () => {
  const req = new NextRequest('http://127.0.0.1:3110/api/calendar/subscriptions/mine', { headers: { host: '127.0.0.1:3110', origin: 'http://127.0.0.1:3110' } });
  expect(req.nextUrl.origin).toBe('http://localhost:3110');
  expect(hasSameRequestOrigin(req)).toBe(true);
});

it('rejects cross-origin hosts, ports, protocols, null origins and spoofed forwarded-host headers', () => {
  for (const origin of ['https://attacker.invalid', 'https://preview.example:444', 'http://preview.example', 'null', 'https://preview.example/path']) {
    const req = new NextRequest('https://preview.example/api/calendar/subscriptions/mine', { headers: { host: 'preview.example', origin, 'x-forwarded-host': 'attacker.invalid' } });
    expect(hasSameRequestOrigin(req)).toBe(false);
  }
});

it('accepts same-origin previews and non-browser clients without relying on forwarded host', () => {
  for (const origin of ['https://preview.example', undefined]) {
    const headers = new Headers({ host: 'preview.example', 'x-forwarded-host': 'attacker.invalid' });
    if (origin) headers.set('origin', origin);
    expect(hasSameRequestOrigin(new NextRequest('https://preview.example/api/calendar/subscriptions/mine', { headers }))).toBe(true);
  }
});
