import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

export async function GET() {
  return NextResponse.json({ isConfigured: isSupabaseConfigured });
}
