import { z } from 'zod';
import { projectSort } from './project';

const schema = z.object({
  id: z.guid(),
  // PostgreSQL returns fractional seconds. Preserve every digit for lexicographical paging.
  createdAt: z.iso.datetime({ offset: true }),
  sort: projectSort,
});

export type ProjectListCursor = z.infer<typeof schema>;

export function decodeProjectCursor(value: string, sort: ProjectListCursor['sort']): ProjectListCursor | null {
  try {
    const cursor = schema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString()));
    return cursor.success && cursor.data.sort === sort ? cursor.data : null;
  } catch {
    return null;
  }
}

export function encodeProjectCursor(cursor: ProjectListCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
