'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DayHalf, PlanningBlock, PlanningFinding, PlanningTask } from '@/lib/planning/intelligence';

type Person = { id: string; name: string };
type Project = { id: string; project_title: string; client_id: string | null; project_manager_id: string | null; field_manager_id: string | null };
type Client = { id: string; client_name: string; location: string | null };
type Cell = { userId: string; date: string; capacityHalves: number | null; occupiedHalves: number;
  taskIds: string[]; adjacentTaskIds: string[]; findings: PlanningFinding[]; quality: 'known' | 'incomplete' };
type Payload = { tasks: PlanningTask[]; blocks: PlanningBlock[]; people: Person[]; projects: Project[]; clients: Client[];
  matrix: Cell[]; start: string; days: number; canWrite: boolean; specialTaskIds: string[] };
type View = 'pending' | 'team' | 'projects';

function addDays(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function label(date: string) { return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00Z`)); }
function reason(finding: PlanningFinding) {
  return ({ ABSENT: 'Ausência confirmada', OVER_CAPACITY: 'Meio-dia já ocupado ou fora do horário',
    LEGACY_TASK: 'Tarefa antiga sem distribuição por meio-dia', UNKNOWN_SCHEDULE: 'Horário não validado',
    ADJACENT_TASK: 'Tarefas em dias adjacentes', SAME_DAY_TASK: 'Outras tarefas no mesmo dia' })[finding.code];
}

export default function PlanningCenter() {
  const [view, setView] = useState<View>('pending');
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState<7 | 14>(7);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [draftPeople, setDraftPeople] = useState<string[]>([]);
  const [draftBlocks, setDraftBlocks] = useState<PlanningBlock[]>([]);
  const [draftDate, setDraftDate] = useState(start);
  const [draftHalf, setDraftHalf] = useState<DayHalf>('am');
  const [selectedPerson, setSelectedPerson] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/internal/planning?start=${start}&days=${days}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 403 ? 'Sem autorização para consultar o Centro.' : 'Não foi possível carregar o planeamento.');
    setPayload(await response.json());
  }, [start, days]);
  useEffect(() => { let active = true; load().catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [load]);
  const selected = payload?.tasks.find(task => task.id === selectedId) || null;
  const project = payload?.projects.find(item => item.id === selected?.projectId);
  const cells = useMemo(() => new Map(payload?.matrix.map(cell => [`${cell.userId}/${cell.date}`, cell]) || []), [payload]);
  const rankedPeople = useMemo(() => [...(payload?.people || [])].sort((a, b) => {
    const score = (person: Person) => {
      const cell = cells.get(`${person.id}/${draftDate}`);
      return (project?.field_manager_id === person.id ? 40 : project?.project_manager_id === person.id ? 30 : 0)
        + (selected?.assigneeIds.includes(person.id) ? 20 : 0)
        + (cell?.capacityHalves != null && cell.capacityHalves > cell.occupiedHalves ? 10 : 0)
        - (cell?.findings.some(f => f.code === 'ABSENT') ? 100 : 0);
    };
    return score(b) - score(a) || a.name.localeCompare(b.name, 'pt-PT');
  }), [payload, cells, draftDate, project, selected]);
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const pending = payload?.tasks.filter(task => !task.assigneeIds.length ||
    !(payload.blocks.some(block => block.taskId === task.id))) || [];
  const projectTasks = payload?.tasks.filter(task => task.projectId === selectedProjectId) || [];

  function selectTask(task: PlanningTask) {
    setSelectedId(task.id);
    setDraftPeople(task.assigneeIds);
    setDraftBlocks(payload?.blocks.filter(block => block.taskId === task.id) || []);
    setDraftDate(task.estimatedDate && task.estimatedDate >= start && task.estimatedDate <= addDays(start, days - 1) ? task.estimatedDate : start);
    setSelectedPerson(task.assigneeIds[0] || '');
    setError('');
  }
  function addBlock() {
    if (!selected || !selectedPerson) return;
    const block = { taskId: selected.id, userId: selectedPerson, date: draftDate, half: draftHalf };
    if (draftBlocks.some(item => item.userId === block.userId && item.date === block.date && item.half === block.half)) return;
    setDraftBlocks(current => [...current, block].sort((a, b) => a.date.localeCompare(b.date) || a.half.localeCompare(b.half)));
  }
  async function save() {
    if (!selected || !payload?.canWrite) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/internal/planning/assign', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ taskId: selected.id, version: selected.version, assigneeIds: draftPeople,
          blocks: draftBlocks.map(block => ({ userId: block.userId, date: block.date, half: block.half })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível guardar.');
      await load(); setSelectedId(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro de gravação.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-[1500px] p-4 md:p-8 text-foreground">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">Área privada de coordenação</p><h1 className="text-3xl font-bold">Centro de Planeamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">A capacidade só é confirmada quando existe horário validado.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border px-3 py-2" onClick={() => setStart(addDays(start, -days))}>Anterior</button>
        <span className="px-2 font-medium">{label(start)} — {label(addDays(start, days - 1))}</span>
        <button type="button" className="rounded border px-3 py-2" onClick={() => setStart(addDays(start, days))}>Seguinte</button>
        <select aria-label="Período" value={days} onChange={event => setDays(Number(event.target.value) as 7 | 14)} className="rounded border bg-white px-3 py-2"><option value="7">Uma semana</option><option value="14">Duas semanas</option></select>
      </div>
    </header>
    <nav aria-label="Perspetivas de planeamento" className="mb-5 flex gap-2 border-b pb-3">
      {([['pending', 'Por planear'], ['team', 'Equipa'], ['projects', 'Projetos']] as const).map(([id, title]) =>
        <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}
          className={`rounded px-4 py-2 font-medium ${view === id ? 'bg-slate-900 text-white' : 'bg-white border'}`}>{title}</button>)}
    </nav>
    {error && <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-900">{error}</div>}
    {!payload && !error && <p>Carregar planeamento…</p>}
    {payload && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section>
        {view === 'pending' && <div className="space-y-2">{pending.length ? pending.map(task => <button type="button" key={task.id}
          onClick={() => selectTask(task)} className="block w-full rounded border bg-white p-4 text-left hover:border-slate-500">
          <strong>{task.title}</strong><span className="ml-2 text-sm text-muted-foreground">{payload.projects.find(p => p.id === task.projectId)?.project_title || 'Sem projeto'}</span>
          <p className="text-sm">{!task.assigneeIds.length ? 'Sem responsável · ' : ''}{!payload.blocks.some(b => b.taskId === task.id) ? 'Sem blocos de execução' : ''}</p>
        </button>) : <p className="rounded border bg-white p-5">Não há tarefas pendentes nesta seleção.</p>}</div>}
        {view === 'team' && <div className="overflow-x-auto rounded border bg-white"><table className="min-w-[760px] w-full text-left text-sm"><thead><tr><th className="sticky left-0 bg-white p-3">Técnico</th>{dates.map(date => <th key={date} className="p-3">{label(date)}</th>)}</tr></thead>
          <tbody>{payload.people.map(person => <tr key={person.id} className="border-t"><th className="sticky left-0 bg-white p-3">{person.name}</th>{dates.map(date => {
            const cell = cells.get(`${person.id}/${date}`); const names = cell?.taskIds.map(id => payload.tasks.find(t => t.id === id)?.title).filter(Boolean) || [];
            return <td key={date} className="min-w-28 p-3 align-top"><span className="font-medium">{cell?.capacityHalves == null ? 'Capacidade não determinada' : `${cell.occupiedHalves}/${cell.capacityHalves} meios-dias`}</span>
              {names.map(name => <p key={name} className="mt-1">{name}</p>)}{cell?.findings.some(f => f.code === 'ABSENT') && <p className="text-red-800">Ausente</p>}</td>;
          })}</tr>)}</tbody></table></div>}
        {view === 'projects' && <><label className="block mb-4 font-medium">Projeto<select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="mt-1 block w-full rounded border bg-white p-2">
          <option value="">Selecionar projeto</option>{payload.projects.map(p => <option key={p.id} value={p.id}>{p.project_title}</option>)}</select></label>
          {selectedProjectId && <div className="space-y-2">{projectTasks.map(task => <button type="button" key={task.id} onClick={() => selectTask(task)} className="block w-full rounded border bg-white p-4 text-left"><strong>{task.title}</strong><p className="text-sm">{task.assigneeIds.length} responsável(eis) · {payload.blocks.filter(b => b.taskId === task.id).length} meio(s)-dia</p></button>)}</div>}</>}
      </section>
      <aside className="rounded border bg-white p-4 lg:sticky lg:top-4 lg:self-start" aria-label="Atribuição rápida">
        {!selected ? <p>Selecione uma tarefa para avaliar a atribuição.</p> : <><h2 className="text-xl font-semibold">{selected.title}</h2><p className="mb-4 text-sm text-muted-foreground">{project?.project_title || 'Sem projeto'}</p>
          {payload.specialTaskIds.includes(selected.id) && <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm">Tarefa de pedido especial: a atribuição deve ser feita no próprio pedido.</p>}
          <fieldset><legend className="font-medium">Técnicos sugeridos</legend><div className="max-h-36 overflow-y-auto">{rankedPeople.map(person => <label key={person.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={draftPeople.includes(person.id)} onChange={e => {
            setDraftPeople(current => e.target.checked ? [...current, person.id] : current.filter(id => id !== person.id));
            if (!e.target.checked) { setDraftBlocks(current => current.filter(block => block.userId !== person.id));
              if (selectedPerson === person.id) setSelectedPerson(''); }
          }}/>{person.name}</label>)}</div></fieldset>
          <div className="mt-4 grid grid-cols-2 gap-2"><label className="col-span-2">Técnico para o bloco<select className="mt-1 w-full rounded border p-2" value={selectedPerson} onChange={e => setSelectedPerson(e.target.value)}><option value="">Selecionar</option>{payload.people.filter(p => draftPeople.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Data<input type="date" className="mt-1 w-full rounded border p-2" value={draftDate} onChange={e => setDraftDate(e.target.value)}/></label>
            <label>Período<select className="mt-1 w-full rounded border p-2" value={draftHalf} onChange={e => setDraftHalf(e.target.value as DayHalf)}><option value="am">Manhã</option><option value="pm">Tarde</option></select></label></div>
          <button type="button" onClick={addBlock} disabled={!selectedPerson || !draftPeople.includes(selectedPerson)} className="mt-2 rounded border px-3 py-2 disabled:opacity-50">Adicionar meio-dia</button>
          <ul className="mt-3 max-h-40 overflow-y-auto text-sm">{draftBlocks.map((block, index) => <li key={`${block.userId}-${block.date}-${block.half}`} className="flex justify-between border-b py-1"><span>{block.date} · {block.half === 'am' ? 'Manhã' : 'Tarde'} · {payload.people.find(p => p.id === block.userId)?.name}</span><button type="button" aria-label={`Remover bloco ${index + 1}`} onClick={() => setDraftBlocks(current => current.filter((_, i) => i !== index))}>×</button></li>)}</ul>
          <h3 className="mt-4 font-medium">Contexto e recomendação</h3>
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto text-sm">{payload.people.filter(p => draftPeople.includes(p.id)).map(person => {
            const cell = cells.get(`${person.id}/${draftDate}`); const relation = project?.field_manager_id === person.id ? 'Responsável técnico' : project?.project_manager_id === person.id ? 'Project Leader' : 'Técnico';
            return <div key={person.id} className="rounded border p-2"><strong>{person.name} · {relation}</strong><p>{cell?.capacityHalves == null ? 'Capacidade não determinada' : `${cell.occupiedHalves}/${cell.capacityHalves} meios-dias ocupados`}</p>
              {cell?.taskIds.length ? <p>No dia: {cell.taskIds.map(id => {
                const task = payload.tasks.find(t => t.id === id);
                return `${task?.title || id}${task?.projectId ? ` [${payload.projects.find(p => p.id === task.projectId)?.project_title || 'Projeto'}]` : ''}`;
              }).join(', ')}</p> : null}
              {cell?.findings.map((f, i) => <p key={i}>{reason(f)}{f.evidenceTaskIds.length ? `: ${f.evidenceTaskIds.map(id => payload.tasks.find(t => t.id === id)?.title || id).join(', ')}` : ''}</p>)}
              {cell?.adjacentTaskIds.length ? <p>Adjacentes: {cell.adjacentTaskIds.map(id => {
                const task = payload.tasks.find(t => t.id === id);
                const adjacentProject = payload.projects.find(p => p.id === task?.projectId);
                const client = payload.clients.find(c => c.id === adjacentProject?.client_id);
                return `${task?.title || id}${client?.location ? ` — ${client.location} (localização indicativa do cliente)` : ' — local desconhecido'}`;
              }).join(', ')}</p> : null}</div>;
          })}</div>
          <div className="mt-4 flex gap-2"><button type="button" disabled={busy || !payload.canWrite || payload.specialTaskIds.includes(selected.id)} onClick={save} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{busy ? 'A guardar…' : 'Confirmar'}</button><button type="button" onClick={() => setSelectedId(null)} className="rounded border px-4 py-2">Cancelar</button></div>
          {!payload.canWrite && <p className="mt-2 text-sm">Acesso de consulta. A atribuição exige a permissão de escrita do Centro.</p>}
        </>}
      </aside>
    </div>}
  </main>;
}
