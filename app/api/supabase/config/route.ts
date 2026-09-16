import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  let appConfig: any = null;
  if (isSupabaseConfigured) {
    try {
      const client = createAdminClient() || supabase;
      if (client) {
        const { data } = await client.from('app_configuration').select('*').limit(1);
        if (data && data.length > 0) {
          const configRow = data[0];
          appConfig = {
            appName: configRow.app_name || 'Gestão de projetos e planeamento',
            appDescription: configRow.app_description || '',
            footerText: configRow.footer_text || '',
            logo: configRow.logo_image_path || configRow.logo_url || '',
            footerCopyrightText: configRow.footer_copyright_text || configRow.footer_text || '',
            logoImagePath: configRow.logo_image_path || configRow.logo_url || '',
            theme: configRow.theme_name || 'default',
          };
        }
      }
    } catch {}
  }
  return NextResponse.json({ isConfigured: isSupabaseConfigured, appConfig });
}
