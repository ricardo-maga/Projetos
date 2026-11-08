import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compareLocations, resolveLocation, type Site } from '../lib/planning/geo.ts';

const sites: Site[] = [
  { id: 's1', clientId: 'c1', name: 'Instalação A', region: 'Norte', address: null },
  { id: 's2', clientId: 'c1', name: 'Instalação B', region: 'Sul', address: null },
];
const project = { clientId: 'c1', defaultSiteId: 's1' };

test('herança usa instalação do projeto e compara por identificador', () => {
  const a = resolveLocation({ kind: 'inherit', siteId: null }, project, sites);
  const b = resolveLocation({ kind: 'site', siteId: 's1' }, project, sites);
  assert.equal(a.label, 'Instalação A');
  assert.equal(compareLocations(a, b), 'same_site');
  assert.equal(compareLocations(a, resolveLocation({ kind: 'site', siteId: 's2' }, project, sites)), 'different_region');
});

test('texto do cliente é indicativo e não prova distância', () => {
  const location = resolveLocation({ kind: 'inherit', siteId: null },
    { clientId: 'c1', defaultSiteId: null }, sites, 'Porto');
  assert.equal(location.kind, 'indicative');
  assert.equal(compareLocations(location, resolveLocation({ kind: 'site', siteId: 's1' }, project, sites)), 'unknown');
});

test('instalação de outro cliente é rejeitada pelo resolvedor', () => {
  const location = resolveLocation({ kind: 'site', siteId: 's1' },
    { clientId: 'c2', defaultSiteId: null }, sites);
  assert.equal(location.kind, 'unknown');
});
