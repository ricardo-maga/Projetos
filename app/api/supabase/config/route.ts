export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  // Public branding uses a server-only key; it must not depend on a legacy browser key.
  const client = createAdminClient() || (isSupabaseConfigured ? supabase : null);
  if (!client) {
    return NextResponse.json({ isConfigured: false, appConfig: null, error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  const { data, error } = await client
    .from('app_configuration')
    .select('app_name, app_description, footer_text, footer_copyright_text, logo_url, logo_image_path, theme_name')
    .limit(1);

  if (error) {
    console.error('[PUBLIC CONFIG] Failed to read app_configuration:', error.message);
    return NextResponse.json({ isConfigured: true, appConfig: null, error: 'APP_CONFIGURATION_UNAVAILABLE' }, { status: 503 });
  }

  const configRow = data?.[0];
  if (!configRow) return NextResponse.json({ isConfigured: true, appConfig: null, error: 'APP_CONFIGURATION_EMPTY' });

  const logo = configRow.logo_image_path || configRow.logo_url || '';
  return NextResponse.json({
    isConfigured: true,
    appConfig: {
      appName: configRow.app_name || 'Gestão de projetos e planeamento',
      appDescription: configRow.app_description || '',
      footerText: configRow.footer_text || '',
      footerCopyrightText: configRow.footer_copyright_text || configRow.footer_text || '',
      logo,
      logoImagePath: logo,
      theme: configRow.theme_name || 'default',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
