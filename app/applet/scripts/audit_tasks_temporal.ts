import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(url, key);

async function runAudit() {
  console.log('--- STARTING FASE 73-A READ-ONLY AUDIT ---');

  // Fetch all records from public.tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*');

  if (error) {
    console.error('Error fetching tasks:', error);
    process.exit(1);
  }

  if (!tasks) {
    console.log('No tasks returned');
    return;
  }

  console.log(`Retrieved ${tasks.length} total tasks from public.tasks.\n`);

  // 1. Contagem total
  const totalTasks = tasks.length;
  const totalDeleted = tasks.filter((t: any) => t.deleted === true).length;
  const totalNotDeleted = tasks.filter((t: any) => !t.deleted).length;

  console.log('=== 1. CONTAGEM TOTAL ===');
  console.log(`Total de tasks: ${totalTasks}`);
  console.log(`Total deleted (deleted = true): ${totalDeleted}`);
  console.log(`Total não deleted (deleted = false/null): ${totalNotDeleted}\n`);

  // 2. Estado temporal
  const bothNull = tasks.filter((t: any) => !t.start_date && !t.end_date);
  const bothNotNull = tasks.filter((t: any) => t.start_date && t.end_date);
  const startOnly = tasks.filter((t: any) => t.start_date && !t.end_date);
  const endOnly = tasks.filter((t: any) => !t.start_date && t.end_date);

  console.log('=== 2. ESTADO TEMPORAL (TODAS AS TASKS) ===');
  console.log(`start_date IS NULL AND end_date IS NULL: ${bothNull.length}`);
  console.log(`start_date IS NOT NULL AND end_date IS NOT NULL: ${bothNotNull.length}`);
  console.log(`start_date IS NOT NULL AND end_date IS NULL: ${startOnly.length}`);
  console.log(`start_date IS NULL AND end_date IS NOT NULL: ${endOnly.length}\n`);

  // Also breakdown for active (non-deleted) tasks for additional clarity
  const activeTasks = tasks.filter((t: any) => !t.deleted);
  console.log('=== 2.1 ESTADO TEMPORAL (APENAS TASKS ATIVAS / NÃO DELETED) ===');
  console.log(`start_date IS NULL AND end_date IS NULL: ${activeTasks.filter((t: any) => !t.start_date && !t.end_date).length}`);
  console.log(`start_date IS NOT NULL AND end_date IS NOT NULL: ${activeTasks.filter((t: any) => t.start_date && t.end_date).length}`);
  console.log(`start_date IS NOT NULL AND end_date IS NULL: ${activeTasks.filter((t: any) => t.start_date && !t.end_date).length}`);
  console.log(`start_date IS NULL AND end_date IS NOT NULL: ${activeTasks.filter((t: any) => !t.start_date && t.end_date).length}\n`);

  // 3. Datas inválidas (start_date > end_date quando ambas existem)
  const invalidDates = tasks.filter((t: any) => {
    if (t.start_date && t.end_date) {
      return new Date(t.start_date) > new Date(t.end_date);
    }
    return false;
  });

  console.log('=== 3. DATAS INVÁLIDAS (start_date > end_date) ===');
  console.log(`Quantidade encontrada: ${invalidDates.length}`);
  if (invalidDates.length > 0) {
    invalidDates.forEach((t: any) => {
      console.log(JSON.stringify({
        id: t.id,
        title: t.task_title || t.title,
        start_date: t.start_date,
        end_date: t.end_date,
        estimated_date: t.estimated_date,
        deleted: t.deleted,
        updated_at: t.updated_at,
        version: t.version,
      }, null, 2));
    });
  } else {
    console.log('Nenhum registo com start_date > end_date.\n');
  }

  // 4. Tasks com datas parciais
  const partialTasks = tasks.filter((t: any) =>
    (t.start_date && !t.end_date) || (!t.start_date && t.end_date)
  );

  console.log('=== 4. TASKS COM DATAS PARCIAIS ===');
  console.log(`Quantidade encontrada: ${partialTasks.length}`);
  if (partialTasks.length > 0) {
    partialTasks.forEach((t: any, index: number) => {
      console.log(`\n--- Registos Parcial #${index + 1} ---`);
      console.log(JSON.stringify({
        id: t.id,
        title: t.task_title || t.title,
        project_id: t.project_id,
        start_date: t.start_date,
        end_date: t.end_date,
        estimated_date: t.estimated_date,
        planned_date: t.planned_date ?? null,
        status: t.status ?? t.status_id ?? null,
        deleted: t.deleted,
        created_at: t.created_at,
        updated_at: t.updated_at,
        version: t.version,
      }, null, 2));
    });
  } else {
    console.log('Nenhum registo com data parcial encontrado.\n');
  }

  // 5. Schema sample check to report any extra date/status columns
  const firstTask = tasks[0] || {};
  console.log('\n=== COLUNAS PRESENTES NO SCHEMA ===');
  console.log(Object.keys(firstTask));
}

runAudit();
