import { createHash } from 'node:crypto';
import { createAdminClient } from './supabase/server';
import type { CalendarFeedScope, FeedClient, FeedProject, FeedTask, FeedUser } from './calendarFeeds';

export function validFeedScope(scope: string): scope is CalendarFeedScope {
  return scope === 'mine' || scope === 'all';
}

export function hashFeedToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function calendarFeedDb() {
  const db = createAdminClient();
  if (!db) throw new Error('Base de dados indisponível.');
  return db;
}

interface CalendarFeedRow {
  task_id: string;
  project_id: string | null;
  task_title: string;
  start_date: string | null;
  end_date: string | null;
  estimated_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  version: number | null;
  client_id: string | null;
  client_name: string | null;
  install_project_no: string | null;
  project_updated_at: string | null;
  client_updated_at: string | null;
  assignees: { id: string; name: string; updated_at: string | null }[];
}

export async function loadCalendarFeedData(scope: CalendarFeedScope, ownerId: string) {
  const db = calendarFeedDb();
  const rows: CalendarFeedRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.rpc('list_calendar_feed_events', {
      p_scope: scope, p_user_id: ownerId,
    }).range(from, from + 499);
    if (error) throw error;
    rows.push(...((data || []) as CalendarFeedRow[]));
    if (!data || data.length < 500) break;
  }

  const projects = new Map<string, FeedProject>();
  const clients = new Map<string, FeedClient>();
  const users = new Map<string, FeedUser>();
  const tasks: FeedTask[] = rows.map(row => {
    if (row.project_id && !projects.has(row.project_id)) projects.set(row.project_id, {
      id: row.project_id, client_id: row.client_id, install_project_no: row.install_project_no,
      deleted: false, updated_at: row.project_updated_at,
    });
    if (row.client_id && !clients.has(row.client_id)) clients.set(row.client_id, {
      id: row.client_id, client_name: row.client_name, deleted: false, updated_at: row.client_updated_at,
    });
    const assignees = Array.isArray(row.assignees) ? row.assignees : [];
    for (const user of assignees) users.set(user.id, user);
    return {
      id: row.task_id, project_id: row.project_id, task_title: row.task_title,
      start_date: row.start_date, end_date: row.end_date, estimated_date: row.estimated_date,
      created_at: row.created_at, updated_at: row.updated_at, version: row.version,
      assigneeIds: assignees.map(user => user.id),
    };
  });
  return { scope, ownerId, tasks, projects: [...projects.values()], clients: [...clients.values()], users: [...users.values()] };
}
