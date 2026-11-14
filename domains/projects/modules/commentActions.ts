import { getAuthHeaders } from '@/lib/clientAuth';
import type { Comment } from '@/lib/types';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createCommentActions({ setState, deleteSyncedEntity }: Pick<LegacyActionContext, 'setState' | 'deleteSyncedEntity'>) {
  const addComment = async (projectId: string, _authorId: string, text: string) => {
    try {
      const response = await fetch('/api/v1/projects/comments', {
        method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, comment: text }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || !result.data?.id)
        return { success: false, message: result.message || 'Não foi possível gravar o comentário.' };
      setState(previous => previous ? ({ ...previous, comments: [...previous.comments, result.data as Comment] }) : previous);
      return { success: true };
    } catch { return { success: false, message: 'Falha de comunicação ao gravar o comentário.' }; }
  };

  const deleteComment = (id: string) => deleteSyncedEntity('comments', id);
  return { addComment, deleteComment };
}
