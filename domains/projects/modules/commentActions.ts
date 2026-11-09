import type { Comment } from '@/lib/types';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createCommentActions({ saveState, genId, deleteSyncedEntity }: Pick<LegacyActionContext, 'saveState' | 'genId' | 'deleteSyncedEntity'>) {
  const addComment = (projectId: string, authorId: string, text: string) => {
    const newComment: Comment = {
      id: genId('com'),
      projectId,
      authorId,
      comment: text,
      createdDate: new Date().toISOString(),
    };
    saveState(previous => ({ ...previous, comments: [...previous.comments, newComment] }));
  };

  const deleteComment = (id: string) => deleteSyncedEntity('comments', id);
  return { addComment, deleteComment };
}
