'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DayHalf, PlanningBlock, PlanningFinding, PlanningTask } from '@/lib/planning/intelligence';
import { compareLocations, type LocationContext } from '@/lib/planning/geo';

type Person = { id: string; name: string };
type Project = { id: string; project_title: string; client_id: string | null; project_manager_id: string | null;
  field_manager_id: string | null; default_site_id: string | null; version: number };
type Client = { id: string; client_name: string; location: string | null };
type SiteRow = { id: string; client_id: string; name: string; address: string | null;
  region: string | null; deleted: boolean; version: number };
type Category = { id: string; name: string };
type Template = { id: string; title: string };
type Requirement = { id: string; categoryId: string; defaultTaskId: string;
  necessity: 'mandatory' | 'recommended' | 'conditional'; conditionCode: string | null;
  sortOrder: number; active: boolean; version: number };
type Readiness = { mandatory: number; missing: number; unassigned: number; unplanned: number;
  completed: number; waived: number; items: Array<{ requirementId: string; stateVersion: number;
    taskId: string | null; waived: boolean; missing: boolean; unassigned: boolean;
    unplanned: boolean; complete: boolean }> };
type Cell = { userId: string; date: string; capacityHalves: number | null; occupiedHalves: number;
  taskIds: string[]; adjacentTaskIds: string[]; findings: PlanningFinding[]; quality: 'known' | 'incomplete' };
type Payload = { tasks: PlanningTask[]; blocks: PlanningBlock[]; people: Person[]; projects: Project[]; clients: Client[];
  matrix: Cell[]; start: string; days: number; canWrite: boolean; canConfigure: boolean;
  specialTaskIds: string[]; categories: Category[]; templates: Template[];
  requirements: Requirement[]; readinessByProject: Record<string, Readiness>;
  sites: SiteRow[]; locationByTask: Record<string, LocationContext>;
  canManageSites: boolean; canManageProjectSites: boolean };
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
  const [requirementTask, setRequirementTask] = useState<Record<string, string>>({});
  const [waiverReason, setWaiverReason] = useState<Record<string, string>>({});
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogTemplate, setCatalogTemplate] = useState('');
  const [catalogNecessity, setCatalogNecessity] = useState<Requirement['necessity']>('mandatory');
  const [catalogCondition, setCatalogCondition] = useState('');
  const [draftLocationKind, setDraftLocationKind] = useState<PlanningTask['executionLocationKind']>('inherit');
  const [draftSiteId, setDraftSiteId] = useState('');
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteRegion, setSiteRegion] = useState('');
  const [projectSiteDraft, setProjectSiteDraft] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/internal/planning?start=${start}&days=${days}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 403 ? 'Sem autorização para consultar o Centro.' : 'Não foi possível carregar o planeamento.');
    setPayload(await response.json());
  }, [start, days]);
  useEffect(() => { let active = true; load().catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [load]);
  const selected = payload?.tasks.find(task => task.id === selectedId) || null;
  const project = payload?.projects.find(item => item.id === selected?.projectId);
  const projectForView = payload?.projects.find(item => item.id === selectedProjectId);
  const visibleSites = payload?.sites.filter(site => !site.deleted && site.client_id === (project?.client_id || projectForView?.client_id)) || [];
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
    setDraftLocationKind(task.executionLocationKind || 'inherit');
    setDraftSiteId(task.executionSiteId || '');
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
  async function requirementAction(requirementId: string, version: number,
    action: 'instantiate' | 'link' | 'waive' | 'clear') {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/internal/planning/requirements/action', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, requirementId, version, action,
          taskId: action === 'link' ? requirementTask[requirementId] : undefined,
          reason: action === 'waive' ? waiverReason[requirementId] : undefined }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível alterar o requisito.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro de gravação.'); }
    finally { setBusy(false); }
  }
  async function addRequirement() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/internal/planning/requirements/catalog', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: catalogCategory, defaultTaskId: catalogTemplate,
          necessity: catalogNecessity, conditionCode: catalogNecessity === 'conditional' ? catalogCondition : null,
          sortOrder: 0, active: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível guardar o catálogo.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro de configuração.'); }
    finally { setBusy(false); }
  }
  async function toggleRequirement(requirement: Requirement) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/internal/planning/requirements/catalog', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requirement.id, version: requirement.version,
          categoryId: requirement.categoryId, defaultTaskId: requirement.defaultTaskId,
          necessity: requirement.necessity, conditionCode: requirement.conditionCode,
          sortOrder: requirement.sortOrder, active: !requirement.active }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar o requisito.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro de configuração.'); }
    finally { setBusy(false); }
  }
  async function saveLocation(target: 'task' | 'project', siteId: string | null) {
    if (!payload) return;
    const entity = target === 'task' ? selected : payload.projects.find(p => p.id === selectedProjectId);
    if (!entity) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/internal/planning/location', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, id: entity.id, version: entity.version,
          ...(target === 'task' ? { kind: draftLocationKind } : {}), siteId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível guardar o local.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro de gravação.'); }
    finally { setBusy(false); }
  }
  async function addSite() {
    if (!payload) return;
    const project = payload.projects.find(p => p.id === selectedProjectId);
    if (!project?.client_id) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/internal/planning/sites', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: project.client_id, name: siteName,
          address: siteAddress || null, region: siteRegion || null, deleted: false }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível criar a instalação.');
      setSiteName(''); setSiteAddress(''); setSiteRegion(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro de configuração.'); }
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
        {view === 'projects' && <><label className="block mb-4 font-medium">Projeto<select value={selectedProjectId} onChange={e => {
          setSelectedProjectId(e.target.value);
          setProjectSiteDraft(payload.projects.find(p => p.id === e.target.value)?.default_site_id || '');
        }} className="mt-1 block w-full rounded border bg-white p-2">
          <option value="">Selecionar projeto</option>{payload.projects.map(p => <option key={p.id} value={p.id}>{p.project_title}</option>)}</select></label>
          {selectedProjectId && <div className="space-y-4">
            <div className="rounded border bg-white p-4"><h2 className="font-semibold">Local do projeto</h2>
              <p className="text-sm">{payload.clients.find(c => c.id === projectForView?.client_id)?.client_name || 'Cliente não definido'}</p>
              <div className="mt-2 flex flex-wrap gap-2"><select aria-label="Instalação predefinida" value={projectSiteDraft} onChange={e => setProjectSiteDraft(e.target.value)} className="min-w-44 rounded border p-2"><option value="">Sem instalação definida</option>{payload.sites.filter(site => !site.deleted && site.client_id === projectForView?.client_id).map(site => <option key={site.id} value={site.id}>{site.name}{site.region ? ` · ${site.region}` : ''}</option>)}</select>
                {payload.canWrite && payload.canManageProjectSites && <button type="button" disabled={busy || projectSiteDraft === (projectForView?.default_site_id || '')} onClick={() => saveLocation('project', projectSiteDraft || null)} className="rounded border px-3 py-2">Guardar local</button>}</div>
              {payload.canWrite && payload.canManageSites && projectForView?.client_id && <div className="mt-4 grid gap-2 sm:grid-cols-2"><input aria-label="Nome da nova instalação" placeholder="Nome da instalação" value={siteName} onChange={e => setSiteName(e.target.value)} className="rounded border p-2" /><input aria-label="Região da instalação" placeholder="Região (opcional)" value={siteRegion} onChange={e => setSiteRegion(e.target.value)} className="rounded border p-2" /><input aria-label="Morada da instalação" placeholder="Morada (opcional)" value={siteAddress} onChange={e => setSiteAddress(e.target.value)} className="rounded border p-2 sm:col-span-2" /><button type="button" disabled={busy || siteName.trim().length < 2} onClick={addSite} className="rounded border px-3 py-2">Adicionar instalação</button></div>}
              <p className="mt-2 text-xs">A localização textual do cliente é apenas indicativa; as instalações são selecionadas explicitamente.</p>
            </div>
            {payload.readinessByProject[selectedProjectId] && <div className="rounded border bg-white p-4"><h2 className="font-semibold">Preparação do projeto</h2><p className="text-sm">Obrigatórias: {payload.readinessByProject[selectedProjectId].mandatory} · Em falta: {payload.readinessByProject[selectedProjectId].missing} · Sem responsável: {payload.readinessByProject[selectedProjectId].unassigned} · Sem data: {payload.readinessByProject[selectedProjectId].unplanned} · Concluídas: {payload.readinessByProject[selectedProjectId].completed} · Dispensadas: {payload.readinessByProject[selectedProjectId].waived}</p></div>}
            <div className="space-y-2">{payload.readinessByProject[selectedProjectId]?.items.map(item => {
              const requirement = payload.requirements.find(r => r.id === item.requirementId);
              const template = payload.templates.find(t => t.id === requirement?.defaultTaskId);
              const task = payload.tasks.find(t => t.id === item.taskId);
              return <div key={item.requirementId} className="rounded border bg-white p-4"><strong>{template?.title || 'Modelo indisponível'}</strong><span className="ml-2 text-sm">{requirement?.necessity === 'mandatory' ? 'Obrigatória' : requirement?.necessity === 'conditional' ? 'Condicional' : 'Recomendada'}</span>
                <p className="text-sm">{item.waived ? 'Dispensada com justificação' : task ? `Associada a ${task.title}` : 'Em falta'}</p>
                {payload.canWrite && item.missing && <div className="mt-2 space-y-2">
                  <button type="button" disabled={busy} onClick={() => requirementAction(item.requirementId, item.stateVersion, 'instantiate')} className="rounded border px-3 py-2">Criar a partir do modelo</button>
                  <div className="flex flex-wrap gap-2"><select aria-label={`Tarefa existente para ${template?.title}`} value={requirementTask[item.requirementId] || ''} onChange={e => setRequirementTask(current => ({ ...current, [item.requirementId]: e.target.value }))} className="rounded border bg-white p-2"><option value="">Associar tarefa existente</option>{projectTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
                    <button type="button" disabled={busy || !requirementTask[item.requirementId]} onClick={() => requirementAction(item.requirementId, item.stateVersion, 'link')} className="rounded border px-3 py-2">Associar</button></div>
                  <div className="flex flex-wrap gap-2"><input aria-label={`Justificação para dispensar ${template?.title}`} placeholder="Justificação para dispensa" value={waiverReason[item.requirementId] || ''} onChange={e => setWaiverReason(current => ({ ...current, [item.requirementId]: e.target.value }))} className="min-w-44 flex-1 rounded border p-2" />
                    <button type="button" disabled={busy || (waiverReason[item.requirementId] || '').trim().length < 10} onClick={() => requirementAction(item.requirementId, item.stateVersion, 'waive')} className="rounded border px-3 py-2">Dispensar</button></div>
                </div>}
                {payload.canWrite && item.waived && <button type="button" disabled={busy} onClick={() => requirementAction(item.requirementId, item.stateVersion, 'clear')} className="mt-2 rounded border px-3 py-2">Retirar dispensa</button>}
              </div>;
            })}</div>
            <div className="space-y-2">{projectTasks.map(task => <button type="button" key={task.id} onClick={() => selectTask(task)} className="block w-full rounded border bg-white p-4 text-left"><strong>{task.title}</strong><p className="text-sm">{task.assigneeIds.length} responsável(eis) · {payload.blocks.filter(b => b.taskId === task.id).length} meio(s)-dia</p></button>)}</div>
          </div>}
          {payload.canConfigure && <section className="mt-6 rounded border bg-white p-4"><h2 className="font-semibold">Catálogo por categoria</h2><p className="mb-2 text-sm">Configuração reservada a quem tem permissão de configuração.</p>
            <div className="grid gap-2 sm:grid-cols-2"><select aria-label="Categoria" value={catalogCategory} onChange={e => setCatalogCategory(e.target.value)} className="rounded border p-2"><option value="">Categoria</option>{payload.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select aria-label="Modelo de tarefa" value={catalogTemplate} onChange={e => setCatalogTemplate(e.target.value)} className="rounded border p-2"><option value="">Modelo</option>{payload.templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
              <select aria-label="Obrigatoriedade" value={catalogNecessity} onChange={e => setCatalogNecessity(e.target.value as Requirement['necessity'])} className="rounded border p-2"><option value="mandatory">Obrigatória</option><option value="recommended">Recomendada</option><option value="conditional">Condicional</option></select>
              {catalogNecessity === 'conditional' && <select aria-label="Condição" value={catalogCondition} onChange={e => setCatalogCondition(e.target.value)} className="rounded border p-2"><option value="">Condição</option><option value="install_project_no">Tem número de instalação</option><option value="sf_opportunity_no">Tem oportunidade SF</option></select>}
            </div><button type="button" disabled={busy || !catalogCategory || !catalogTemplate || (catalogNecessity === 'conditional' && !catalogCondition)} onClick={addRequirement} className="mt-3 rounded border px-3 py-2">Adicionar requisito</button>
            <ul className="mt-4 space-y-2 text-sm">{payload.requirements.map(requirement => <li key={requirement.id} className="flex items-center justify-between gap-2 border-t pt-2"><span>{payload.categories.find(c => c.id === requirement.categoryId)?.name || 'Categoria'} · {payload.templates.find(t => t.id === requirement.defaultTaskId)?.title || 'Modelo'} · {requirement.necessity === 'mandatory' ? 'Obrigatória' : requirement.necessity === 'conditional' ? 'Condicional' : 'Recomendada'} · {requirement.active ? 'Ativa' : 'Inativa'}</span><button type="button" disabled={busy} onClick={() => toggleRequirement(requirement)} className="rounded border px-2 py-1">{requirement.active ? 'Desativar' : 'Ativar'}</button></li>)}</ul>
          </section>}</>}
      </section>
      <aside className="rounded border bg-white p-4 lg:sticky lg:top-4 lg:self-start" aria-label="Atribuição rápida">
        {!selected ? <p>Selecione uma tarefa para avaliar a atribuição.</p> : <><h2 className="text-xl font-semibold">{selected.title}</h2><p className="mb-4 text-sm text-muted-foreground">{project?.project_title || 'Sem projeto'}</p>
          <div className="mb-4 rounded border p-3"><h3 className="font-medium">Local de execução</h3><p className="text-sm">{payload.locationByTask[selected.id]?.label || 'Local desconhecido'}</p>
            <div className="mt-2 flex flex-wrap gap-2"><select aria-label="Modo de execução" value={draftLocationKind} onChange={e => { setDraftLocationKind(e.target.value as PlanningTask['executionLocationKind']); setDraftSiteId(''); }} className="rounded border p-2"><option value="inherit">Herdar do projeto</option><option value="site">Outra instalação</option><option value="company">Na empresa</option><option value="remote">Remoto</option><option value="unknown">Desconhecido</option></select>
              {draftLocationKind === 'site' && <select aria-label="Instalação da tarefa" value={draftSiteId} onChange={e => setDraftSiteId(e.target.value)} className="rounded border p-2"><option value="">Selecionar instalação</option>{visibleSites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>}
              {payload.canWrite && !payload.specialTaskIds.includes(selected.id) && <button type="button" disabled={busy || (draftLocationKind === 'site' && !draftSiteId)} onClick={() => saveLocation('task', draftLocationKind === 'site' ? draftSiteId : null)} className="rounded border px-3 py-2">Guardar local</button>}</div>
          </div>
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
                const currentLocation = payload.locationByTask[selected.id];
                const nextLocation = payload.locationByTask[id];
                const comparison = currentLocation && nextLocation ? compareLocations(currentLocation, nextLocation) : 'unknown';
                const note = comparison === 'same_site' ? 'mesma instalação; oportunidade de continuidade'
                  : comparison === 'different_region' ? 'outra região; verificar deslocação'
                  : comparison === 'different_site' ? 'instalação diferente; verificar deslocação'
                  : comparison === 'travel_not_applicable' ? 'deslocação não aplicável' : 'deslocação não determinada';
                return `${task?.title || id} — ${nextLocation?.label || client?.location || 'local desconhecido'} (${note})`;
              }).join(', ')}</p> : null}</div>;
          })}</div>
          <div className="mt-4 flex gap-2"><button type="button" disabled={busy || !payload.canWrite || payload.specialTaskIds.includes(selected.id)} onClick={save} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{busy ? 'A guardar…' : 'Confirmar'}</button><button type="button" onClick={() => setSelectedId(null)} className="rounded border px-4 py-2">Cancelar</button></div>
          {!payload.canWrite && <p className="mt-2 text-sm">Acesso de consulta. A atribuição exige a permissão de escrita do Centro.</p>}
        </>}
      </aside>
    </div>}
  </main>;
}
