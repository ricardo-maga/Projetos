import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { projectInIntegrationScope, projectScopeFilter } from '../lib/integrations/scope.ts';

test('integration scope is mandatory and either approved client or project grants access', () => {
  const scope = { client_ids: ['client-a'], project_ids: ['project-b'] };
  assert.equal(projectInIntegrationScope(scope, { id: 'project-a', client_id: 'client-a' }), true);
  assert.equal(projectInIntegrationScope(scope, { id: 'project-b', client_id: 'client-b' }), true);
  assert.equal(projectInIntegrationScope(scope, { id: 'project-c', client_id: 'client-c' }), false);
  assert.equal(projectScopeFilter([], []).kind, 'none');
  assert.deepEqual(projectScopeFilter(['client-a'], []).value, ['client-a']);
  assert.deepEqual(projectScopeFilter([], ['project-b']).value, ['project-b']);
  assert.equal(projectScopeFilter(['client-a'], ['project-b']).value, 'client_id.in.(client-a),id.in.(project-b)');
});
