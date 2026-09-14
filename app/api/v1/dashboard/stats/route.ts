import { NextRequest, NextResponse } from 'next/server';
import { formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ success: false, message: 'Supabase não configurado.' }, { status: 400 });
  }
  
  try {
    const { count: activeProjectsCount } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('deleted', false);
    const { count: activeTasksCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('deleted', false);
    const { count: clientsCount } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('deleted', false);
    const { count: ticketsCount } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('deleted', false);

    const { data: recentProjects } = await supabase.from('projects').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(10);
    const { data: recentTasks } = await supabase.from('tasks').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(10);
    const { data: projectStatuses } = await supabase.from('project_status').select('*');
    const { data: taskStatuses } = await supabase.from('task_status').select('*');

    return NextResponse.json({
      success: true,
      data: {
        activeProjects: activeProjectsCount || 0,
        activeTasks: activeTasksCount || 0,
        clientsCount: clientsCount || 0,
        ticketsCount: ticketsCount || 0,
        recentProjects: recentProjects || [],
        recentTasks: recentTasks || [],
        projectStatuses: projectStatuses || [],
        taskStatuses: taskStatuses || []
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: formatSupabaseError(error) }, { status: 500 });
  }
}
