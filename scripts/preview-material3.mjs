// Local-only visual QA. Run with Bun; no authentication or backend requests.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const root = resolve(import.meta.dir, '..');
const cssPath = resolve(root, 'app/globals.css');
const css = await postcss([tailwindcss({ base: root })]).process(await readFile(cssPath, 'utf8'), { from: cssPath });
const result = await Bun.build({ entrypoints: [resolve(root, 'scripts/material3-preview-client.tsx')], target: 'browser' });
if (!result.success) throw new Error(result.logs.map(String).join('\n'));
const js = await result.outputs[0].text();

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 3103,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/style.css') return new Response(css.css, { headers: { 'Content-Type': 'text/css' } });
    if (path === '/app.js') return new Response(js, { headers: { 'Content-Type': 'application/javascript' } });
    return new Response('<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Material 3 — revisão local</title><link rel="stylesheet" href="/style.css"></head><body style="font-family:Arial,sans-serif"><div id="preview"></div><script type="module" src="/app.js"></script></body></html>', { headers: { 'Content-Type': 'text/html' } });
  },
});
console.log(`Revisão local (dados fictícios): ${server.url}`);
