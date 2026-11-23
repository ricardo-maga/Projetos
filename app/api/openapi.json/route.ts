export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(null, { status: 307, headers: { Location: '/api/v1/openapi.json' } });
}
