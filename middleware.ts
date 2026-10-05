import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { cutoverMaintenanceResponse } from './lib/cutoverMaintenance';

export async function middleware(request: NextRequest) {
  const maintenance = cutoverMaintenanceResponse(request.nextUrl.pathname, process.env.ERP_CUTOVER_MAINTENANCE);
  if (maintenance) return maintenance;
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
