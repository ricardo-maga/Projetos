import { describe, expect, it } from 'bun:test';
import { createProjectSchema, projectListSchema, queryProjectSchema, updateProjectSchema } from '../domains/projects/contracts/project';

describe('project SharePoint URL contract', () => {
  it('preserves the complete HTTPS address and normalizes optional values', () => {
    const sharepointUrl = 'https://documentos.empresa.pt/:f:/s/A%20B?e=123&d=abc#ficheiros';
    expect(createProjectSchema.parse({
      title: 'Projeto', clientId: 'cliente', projectManagerId: 'gestor', categoryId: 'categoria',
      sharepointUrl: ' ' + sharepointUrl + ' ',
    }).sharepointUrl).toBe(sharepointUrl);
    expect(updateProjectSchema.parse({}).sharepointUrl).toBeUndefined();
    expect(updateProjectSchema.parse({ sharepointUrl: '   ' }).sharepointUrl).toBe('');
    expect(projectListSchema.safeParse({ fields: 'id,sharepointUrl' }).success).toBe(true);
  });

  it('rejects incomplete URLs, alternative schemes and embedded credentials', () => {
    for (const sharepointUrl of [
      'empresa.sharepoint.com', '//empresa.sharepoint.com', 'https:///empresa.sharepoint.com',
      'http://empresa.sharepoint.com', 'https://', 'javascript:void(0)',
      'https://user:password@empresa.sharepoint.com',
    ]) {
      expect(updateProjectSchema.safeParse({ sharepointUrl }).success).toBe(false);
    }
  });
});

describe('project list query filters', () => {
  it('accepts empty filters sent by the project list', () => {
    const query = queryProjectSchema.parse({
      page: '1', pageSize: '25', search: '',
      categoryId: '', statusId: '', managerId: '', statusGroup: 'active',
    });

    expect(query.categoryId).toBeUndefined();
    expect(query.statusId).toBeUndefined();
    expect(query.managerId).toBeUndefined();
  });

  it('keeps valid IDs and rejects filter expressions', () => {
    const id = '10000000-0000-0000-0000-000000000001';
    expect(queryProjectSchema.parse({ categoryId: id }).categoryId).toBe(id);
    expect(queryProjectSchema.safeParse({ categoryId: 'x,or(id.eq.1)' }).success).toBe(false);
  });
});
