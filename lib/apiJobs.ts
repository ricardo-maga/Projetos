import { after, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const wantsAsyncResponse = (request: Request) =>
  request.headers.get('prefer')?.split(',').some(value => value.trim().toLowerCase() === 'respond-async');

export async function enqueueApiJob(db: SupabaseClient, actor: { id: string; requestId?: string },
  kind: 'project_import' | 'audit_export', payload: unknown) {
  const { data, error } = await db.from('api_jobs').insert({
    actor_id: actor.id, request_id: actor.requestId || crypto.randomUUID(), kind, payload,
  }).select('id').single();
  if (error || !data) throw error || new Error('Job identifier missing.');
  const jobId = data.id as string;
  after(async () => {
    const { error: workerError } = await db.rpc('process_api_job', { p_job_id: jobId });
    if (workerError) console.error('[API JOB]', jobId, workerError.code);
  });
  return NextResponse.json({ success: true, data: { jobId, status: 'queued' } }, {
    status: 202,
    headers: { Location: `/api/v1/jobs/${jobId}`, 'Preference-Applied': 'respond-async',
      'Retry-After': '2', 'Cache-Control': 'no-store' },
  });
}
