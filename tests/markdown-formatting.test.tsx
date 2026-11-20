import { expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownBody from '../components/ui/MarkdownBody';
import MarkdownContent from '../components/ui/MarkdownContent';
import { updateProjectSchema } from '../domains/projects/contracts/project';

it('renders project Markdown with paragraphs, both headings, marks, lists and safe links', () => {
  const markdown = '# Título\n\n## Subtítulo\n\n**Forte** e *ênfase*\nsegunda linha\n\n- Material\n\n1. Instalar\n\n[Manual](https://example.com)';
  const html = renderToStaticMarkup(<MarkdownBody text={markdown} />);
  for (const tag of ['<h1', '<h2', '<strong>Forte</strong>', '<em>ênfase</em>', '<br', '<ul', '<ol']) expect(html).toContain(tag);
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).not.toContain('max-h-28');
  expect(html).not.toContain('Mostrar mais');
});

it('sanitizes executable HTML and unsafe URLs in descriptions and previews', () => {
  const markdown = 'Texto <script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">Perigo</a> [Outro](javascript:alert%284%29)';
  for (const inline of [false, true]) {
    const html = renderToStaticMarkup(<MarkdownContent text={markdown} inline={inline} />);
    expect(html).toContain('Texto');
    expect(html).not.toMatch(/<script|<img|onerror|href="javascript:/i);
  }
});

it('shows plain text previews inside project navigation buttons without nested links or Markdown markers', () => {
  const html = renderToStaticMarkup(<button><MarkdownContent inline text={'# Instalação\n\n**Motor** e *sensor*\n\n- [Manual](https://example.com)\n- Ensaios'} /></button>);
  expect(html).toContain('Motor');
  expect(html).toContain('Manual');
  expect(html).toContain('Ensaios');
  expect(html).not.toMatch(/<a\b|<p\b|<h1\b|<ul\b|<li\b|<strong\b|\*\*|https:\/\//);
});

it('preserves the description string contract including Markdown, clearing and the stored length limit', () => {
  const description = '**Motor**\n\n[Manual](https://example.com)';
  expect(updateProjectSchema.parse({ description }).description).toBe(description);
  expect(updateProjectSchema.parse({ description: '' }).description).toBe('');
  expect(updateProjectSchema.safeParse({ description: 'a'.repeat(10000) }).success).toBe(true);
  expect(updateProjectSchema.safeParse({ description: 'a'.repeat(10001) }).success).toBe(false);
});
