import { NextRequest, NextResponse } from 'next/server';
import { formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

export async function GET() {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // transform keys to camelCase if needed, but the client expects camelCase.
    // The DB uses snake_case, but actually the types and save logic in lib/supabaseSync might map them.
    // Let's check how the DB schema is.
    // Actually, saveActiveStateToSupabase maps them. We should just return the data.
    const clients = (data || []).map(c => ({
      id: c.id,
      clientName: c.client_name || c.clientName,
      shortName: c.short_name || c.shortName,
      location: c.location,
      taxId: c.tax_id || c.taxId,
      contactPerson: c.contact_person || c.contactPerson,
      contactEmail: c.contact_email || c.contactEmail,
      contactPhone: c.contact_phone || c.contactPhone,
      notes: c.notes,
      deleted: c.deleted,
      createdDate: c.created_at || c.createdDate
    }));

    return NextResponse.json({ success: true, count: clients.length, data: clients });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }
  try {
    const body = await req.json();
    const clientName = body.clientName || body.name;
    if (!clientName) {
      return NextResponse.json({ success: false, message: 'O campo "clientName" ou "name" é obrigatório.' }, { status: 400 });
    }

    const newClient = {
      id: crypto.randomUUID(),
      client_name: clientName,
      short_name: body.shortName || clientName.substring(0, 10),
      location: body.location || body.address || '',
      tax_id: body.taxId || body.nif || '',
      contact_person: body.contactPerson || '',
      contact_email: body.contactEmail || body.email || '',
      contact_phone: body.contactPhone || body.phone || '',
      notes: body.notes || '',
      deleted: false,
    };

    const { error } = await supabase.from('clients').insert([newClient]);
    if (error) throw error;

    const returnClient = {
      ...newClient,
      clientName: newClient.client_name,
      shortName: newClient.short_name,
      taxId: newClient.tax_id,
      contactPerson: newClient.contact_person,
      contactEmail: newClient.contact_email,
      contactPhone: newClient.contact_phone,
    };

    return NextResponse.json({ success: true, message: 'Cliente criado com sucesso.', data: returnClient }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
