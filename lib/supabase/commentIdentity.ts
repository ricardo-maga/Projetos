// Applied after canonical projects:write authorization and before any persistence.
export function prepareCommentChanges(rows: Record<string, unknown>[], current: unknown, userId: string, now: string): Record<string, unknown>[] {
  const existing = new Map((Array.isArray(current) ? current : []).map(row => [row.id,row]));
  return rows.map(row => {
    const old = existing.get(row.id);
    if (typeof row.projectId !== 'string' || !row.projectId) throw new Error('Comentário sem projeto associado.');
    if (old) {
      if (row.projectId !== old.projectId || (row.authorId || '') !== (old.authorId || ''))
        throw new Error('Não é permitido alterar o projeto ou autor de um comentário existente.');
      return { ...row, authorId: old.authorId, projectId: old.projectId, createdDate: old.createdDate };
    }
    if (row.authorId && row.authorId !== userId) throw new Error('O autor do comentário deve corresponder à sessão.');
    return { ...row, authorId: userId, createdDate: now };
  });
}
