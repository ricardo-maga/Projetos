import type { ProjectMaterial } from '@/lib/types';
import { getAuthHeaders } from '@/lib/clientAuth';

export class ProjectMaterialApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...getAuthHeaders(), ...init?.headers },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new ProjectMaterialApiError(result?.message || 'Falha na API de materiais de projeto.', response.status);
  }
  return result;
}

export async function listProjectMaterials(): Promise<ProjectMaterial[]> {
  const materials: ProjectMaterial[] = [];
  for (let page = 1; ; page++) {
    let result: { data: ProjectMaterial[]; totalPages: number };
    try {
      result = await request(`/api/v1/project-materials?page=${page}&pageSize=100`);
    } catch (error) {
      if (error instanceof ProjectMaterialApiError && error.status === 403) return [];
      throw error;
    }
    if (!Array.isArray(result.data) || !Number.isSafeInteger(result.totalPages) || result.totalPages < 0) {
      throw new ProjectMaterialApiError('Resposta inválida da API de materiais de projeto.', 502);
    }
    materials.push(...result.data);
    if (page >= result.totalPages) return materials;
  }
}

export async function createProjectMaterial(input: Omit<ProjectMaterial, 'id' | 'deleted' | 'createdDate'>): Promise<ProjectMaterial> {
  const result = await request<{ data: ProjectMaterial }>('/api/v1/project-materials', {
    method: 'POST', body: JSON.stringify(input),
  });
  return result.data;
}

export async function updateProjectMaterial(id: string, updates: Partial<ProjectMaterial>): Promise<ProjectMaterial> {
  const result = await request<{ data: ProjectMaterial }>(`/api/v1/project-materials/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(updates),
  });
  return result.data;
}

export async function deleteProjectMaterial(id: string): Promise<void> {
  await request(`/api/v1/project-materials/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
