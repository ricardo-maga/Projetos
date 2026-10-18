export function projectInIntegrationScope(scope: { client_ids: string[]; project_ids: string[] }, project: { id: string; client_id: string }) {
  return scope.project_ids.includes(project.id) || scope.client_ids.includes(project.client_id);
}

export function projectScopeFilter(clientIds: string[], projectIds: string[]) {
  if (clientIds.length && projectIds.length)
    return { kind: 'or' as const, value: `client_id.in.(${clientIds.join(',')}),id.in.(${projectIds.join(',')})` };
  if (clientIds.length) return { kind: 'clients' as const, value: clientIds };
  if (projectIds.length) return { kind: 'projects' as const, value: projectIds };
  return { kind: 'none' as const, value: null };
}
