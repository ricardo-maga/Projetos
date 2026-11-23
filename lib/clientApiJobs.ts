import { authenticatedRequest, getApiErrorMessage, getAuthHeaders } from '@/lib/clientAuth';

type Job<T> = { status: 'queued' | 'succeeded' | 'failed'; result: T; message?: string };

export async function waitForApiJob<T>(id: string): Promise<T> {
  const path = `/api/v1/jobs/${encodeURIComponent(id)}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const response = await authenticatedRequest(path, {
      headers: getAuthHeaders(), cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(getApiErrorMessage(payload, 'Não foi possível consultar o processamento.'));
    const job: Job<T> = payload.data;
    if (job.status === 'succeeded') return job.result;
    if (job.status === 'failed') throw new Error(job.message || 'Não foi possível concluir o processamento.');
  }
  throw new Error(`O processamento ainda está em curso. Referência: ${id}`);
}
