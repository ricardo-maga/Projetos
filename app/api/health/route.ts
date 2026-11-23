export function GET() {
  return Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
