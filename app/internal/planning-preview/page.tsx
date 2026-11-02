import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/requireAuth';
import PlanningCenter from './planning-center';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Centro de Planeamento', robots: { index: false, follow: false } };

export default async function PlanningPreviewPage() {
  if (process.env.PLANNING_PREVIEW_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production') notFound();
  try {
    await requirePermission('tasks_read');
    await requirePermission('planning_center_read');
    await requirePermission('calendar_read');
    await requirePermission('projects_read');
    await requirePermission('clients_read');
    await requirePermission('absences_read');
  } catch { notFound(); }
  return <PlanningCenter />;
}
