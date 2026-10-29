import { expect, test } from 'bun:test';
import { createProjectMaterial, listProjectMaterials, ProjectMaterialApiError, updateProjectMaterial } from '../lib/projectMaterials/client';

test('material listing reads all API pages and fails closed on denied access', async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    paths.push(String(input));
    const page = paths.length;
    return Response.json({ success: true, data: [{ id: `material-${page}` }], totalPages: 2 });
  }) as typeof fetch;
  try {
    expect((await listProjectMaterials()).map(item => item.id)).toEqual(['material-1', 'material-2']);
    expect(paths).toEqual(['/api/v1/project-materials?page=1&pageSize=100', '/api/v1/project-materials?page=2&pageSize=100']);
    globalThis.fetch = (async () => Response.json({ success: false }, { status: 403 })) as typeof fetch;
    expect(await listProjectMaterials()).toEqual([]);
  } finally {
    globalThis.fetch = original;
  }
});

test('material writes use the dedicated API and surface conflicts', async () => {
  const original = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(init?.method || 'GET');
    if (init?.method === 'PUT') return Response.json({ success: false, message: 'Conflito de versão' }, { status: 409 });
    return Response.json({ success: true, data: { id: 'created' } }, { status: 201 });
  }) as typeof fetch;
  try {
    const created = await createProjectMaterial({ projectId: 'project', description: 'Peça', supplier: 'Fornecedor', quantity: 1, status: 'por_encomendar' });
    expect(created.id).toBe('created');
    await expect(updateProjectMaterial('created', { status: 'encomendado', syncVersion: 2 }))
      .rejects.toBeInstanceOf(ProjectMaterialApiError);
    expect(methods).toEqual(['POST', 'PUT']);
  } finally {
    globalThis.fetch = original;
  }
});
