import { describe, expect, it } from 'bun:test';
import { queryProjectSchema } from '../domains/projects/contracts/project';

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
