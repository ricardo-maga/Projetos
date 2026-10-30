'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Plus, RefreshCw, Search } from 'lucide-react';
import { M3Button, M3Card, M3SectionHeader } from './M3';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import Textarea from './ui/Textarea';
import type { Project, ProjectPriority, ProjectStatus, User } from '../lib/types';
import { getAuthHeaders, getApiErrorMessage } from '../lib/clientAuth';
import { TASK_STATUS, isMechanicalDesignManager, type DesignRequest, type DesignTask } from '../lib/mechanicalDesign';
import { hasPermission } from '../lib/permissions';

const statusLabel: Record<DesignRequest['status'], string> = {
  submitted: 'Por aceitar', accepted: 'Em desenvolvimento', rejected: 'Recusado', delivered: 'Entregue',
};
const statusVariant: Record<DesignRequest['status'], 'warning' | 'primary' | 'error' | 'success'> = {
  submitted: 'warning', accepted: 'primary', rejected: 'error', delivered: 'success',
};
const taskLabel: Record<string, string> = {
  [TASK_STATUS.pending]: 'Por iniciar', [TASK_STATUS.progress]: 'Em curso',
  [TASK_STATUS.complete]: 'Completa', [TASK_STATUS.blocked]: 'Bloqueada',
};
const eventLabel: Record<string, string> = {
  create: 'Pedido criado', accept: 'Pedido aceite', reject: 'Pedido recusado', edit: 'Detalhes alterados',
  file: 'Ficheiro registado', deliver: 'Entrega confirmada', add_task: 'Tarefa acrescentada',
  assign_task: 'Responsáveis alterados', assign: 'Responsáveis alterados', start: 'Tarefa iniciada',
  block: 'Tarefa bloqueada', resume: 'Tarefa retomada', complete: 'Tarefa concluída', reopen: 'Tarefa reaberta',
};

interface Props {
  currentUser: User;
  users: User[];
  projects: Project[];
  projectStatuses: ProjectStatus[];
  projectPriorities: ProjectPriority[];
  initialRequestId?: string | null;
  onTasksChanged: () => Promise<unknown>;
}

export default function MechanicalDesignSection({ currentUser, users, projects, projectStatuses, projectPriorities, initialRequestId, onTasksChanged }: Props) {
  const [requests, setRequests] = useState<DesignRequest[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [eligibleExecutorIds, setEligibleExecutorIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (initialRequestId) setSelectedId(initialRequestId); }, [initialRequestId]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const createKey = useRef(crypto.randomUUID());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [showProjectSuggestions, setShowProjectSuggestions] = useState(false);
  const [createUsage, setCreateUsage] = useState('');
  const [createProjectStatusId, setCreateProjectStatusId] = useState('');
  const [createOtherManagerIds, setCreateOtherManagerIds] = useState<string[]>([]);
  const [createRequestedForId, setCreateRequestedForId] = useState('');
  const [createPriorityId, setCreatePriorityId] = useState('');
  const [createStartDate, setCreateStartDate] = useState('');
  const [createEndDate, setCreateEndDate] = useState('');
  const [createInstructions, setCreateInstructions] = useState('');
  const [createDeliverables, setCreateDeliverables] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [usage, setUsage] = useState('');
  const [projectStatusId, setProjectStatusId] = useState('');
  const [otherManagerIds, setOtherManagerIds] = useState<string[]>([]);
  const [requestedForId, setRequestedForId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [fileIdentifier, setFileIdentifier] = useState('');
  const [fileRevision, setFileRevision] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<string[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('1');
  const [newTaskEstimatedDays, setNewTaskEstimatedDays] = useState('1');
  const [reopenReason, setReopenReason] = useState('');

  const alphabetical = (a: User, b: User) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' });
  const allUsers = [...users].filter(user => !user.deleted).sort(alphabetical);
  const activeUsers = allUsers.filter(user => user.approved && user.type !== 'External');
  const executorUsers = activeUsers.filter(user => eligibleExecutorIds.includes(user.id));
  const managerUsers = activeUsers.filter(isMechanicalDesignManager);
  const availableProjects = projects.filter(project => !project.deleted);
  const projectSuggestions = availableProjects.filter(project =>
    `${project.title} ${project.installProjectNo || ''}`.toLocaleLowerCase('pt-PT').includes(projectSearchQuery.trim().toLocaleLowerCase('pt-PT'))).slice(0, 12);
  const statusOptions = [...projectStatuses].sort((a, b) => (a.scale ?? 0) - (b.scale ?? 0));
  const priorityOptions = [...projectPriorities].filter(priority => !priority.deleted).sort((a, b) => (a.scale ?? 0) - (b.scale ?? 0));
  const canCreate = hasPermission(currentUser, 'mechanical_design_create');
  const canExecute = hasPermission(currentUser, 'mechanical_design_execute');
  const selected = requests.find(request => request.id === selectedId) || null;
  const canManage = Boolean(selected && isMechanicalDesignManager(currentUser) && hasPermission(currentUser, 'mechanical_design_manage') &&
    (selected.ownerId === currentUser.id || hasPermission(currentUser, 'mechanical_design_coordinate')));
  const canEditDetails = Boolean(canManage && selected && ['submitted', 'accepted'].includes(selected.status));
  const canReopen = Boolean(selected && selected.ownerId === currentUser.id && isMechanicalDesignManager(currentUser) &&
    hasPermission(currentUser, 'mechanical_design_manage'));
  const isAssigned = Boolean(selected?.tasks.some(task => task.assigneeIds.includes(currentUser.id)));
  const nameOf = (id: string) => users.find(user => user.id === id)?.name || 'Utilizador indisponível';

  const load = useCallback(async (targetPage = 1) => {
    try {
      const response = await fetch(`/api/v1/mechanical-design?page=${targetPage}`, { cache: 'no-store', headers: getAuthHeaders() });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(getApiErrorMessage(result, 'Falha ao carregar pedidos.'));
      setRequests(current => targetPage === 1 ? result.data : [...current, ...result.data.filter((row: DesignRequest) => !current.some(item => item.id === row.id))]);
      setEligibleExecutorIds(result.eligibleExecutorIds || []);
      setPage(targetPage); setTotal(result.total);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Falha ao carregar pedidos.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => {
    if (!initialRequestId || requests.some(request => request.id === initialRequestId)) return;
    let cancelled = false;
    void fetch(`/api/v1/mechanical-design/${initialRequestId}`, { cache: 'no-store', headers: getAuthHeaders() })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!cancelled && result?.success) setRequests(current =>
        current.some(request => request.id === initialRequestId) ? current : [result.data, ...current]); })
      .catch(() => { /* The list retains its own error state. */ });
    return () => { cancelled = true; };
  }, [initialRequestId, requests]);
  useEffect(() => {
    if (!selected) return;
    setInstructions(selected.instructions); setDeliverables(selected.deliverables);
    setUsage(selected.usage); setProjectStatusId(selected.projectStatusId || '');
    setOtherManagerIds(selected.otherManagerIds);
    setRequestedForId(selected.requestedForId || ''); setPriorityId(selected.priorityId || '');
    setFileIdentifier(selected.fileIdentifier); setFileRevision(selected.fileRevision);
    setPlannedStartDate(selected.plannedStartDate); setPlannedEndDate(selected.plannedEndDate);
    setAssigneeIds(selected.tasks.find(task => task.isInitial)?.assigneeIds || []);
  }, [selected]);

  const send = async (url: string, method: 'POST' | 'PATCH', body: object, message: string, idempotencyKey?: string) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(url, { method, headers: getAuthHeaders(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined),
        body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status === 409 && selectedId) {
          const latest = await fetch(`/api/v1/mechanical-design/${selectedId}`, { cache: 'no-store', headers: getAuthHeaders() });
          const latestResult = await latest.json().catch(() => null);
          if (latest.ok && latestResult?.success) setRequests(current => [latestResult.data, ...current.filter(request => request.id !== selectedId)]);
        }
        throw new Error(getApiErrorMessage(result, 'Não foi possível guardar.'));
      }
      if (method === 'POST') await load();
      try { await onTasksChanged(); } catch { /* The saved response remains authoritative. */ }
      setNotice(message);
      return result.data as DesignRequest;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Erro de gravação.');
    } finally { inFlight.current = false; setBusy(false); }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (projectSearchQuery.trim() && !projectId) {
      setError('Selecione um projeto da lista de sugestões ou limpe o campo para criar um pedido independente.');
      return;
    }
    const result = await send('/api/v1/mechanical-design', 'POST', {
      title, ownerId, projectId: projectId || null, instructions: createInstructions, deliverables: createDeliverables,
      plannedStartDate: createStartDate, plannedEndDate: createEndDate, usage: createUsage,
      projectStatusId: createProjectStatusId || null, otherManagerIds: createOtherManagerIds,
      requestedForId: createRequestedForId || null, priorityId: createPriorityId || null,
    }, 'Pedido criado com a tarefa inicial.', createKey.current);
    if (result) { createKey.current = crypto.randomUUID(); setSelectedId(result.id); setTitle('');
      setCreateInstructions(''); setCreateDeliverables(''); setCreateStartDate(''); setCreateEndDate('');
      setProjectId(''); setProjectSearchQuery(''); setCreateUsage(''); setCreateProjectStatusId('');
      setCreateOtherManagerIds([]); setShowCreate(false); }
    if (result) { setCreateRequestedForId(''); setCreatePriorityId(''); }
  };

  const act = async (body: object, message: string) => {
    if (!selected) return;
    const result = await send(`/api/v1/mechanical-design/${selected.id}`, 'PATCH', body, message);
    if (result) { setRequests(current => [result, ...current.filter(request => request.id !== result.id)]); }
    return result;
  };

  const taskAction = async (task: DesignTask, action: 'start' | 'block' | 'resume' | 'complete' | 'reopen') => {
    const result = await act({ action, taskId: task.id, taskVersion: task.version,
      ...(action === 'reopen' ? { reason: reopenReason } : {}) }, 'Estado da tarefa guardado.');
    if (action === 'reopen' && result) setReopenReason('');
  };

  const toggleAssignee = (id: string) => setAssigneeIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const toggleManager = (id: string, creation: boolean) => {
    const update = (current: string[]) => current.includes(id) ? current.filter(value => value !== id) : [...current, id];
    if (creation) setCreateOtherManagerIds(update);
    else setOtherManagerIds(update);
  };
  const selectProject = (project: Project) => {
    setProjectId(project.id);
    setProjectSearchQuery(project.title);
    setShowProjectSuggestions(false);
  };
  const allComplete = Boolean(selected?.tasks.length) && selected!.tasks.every(task => task.statusId === TASK_STATUS.complete);

  return <div className="space-y-5">
    <M3SectionHeader title="Desenho mecânico" description="Pedidos, desenvolvimento e entregas da equipa de desenho."
      actions={<div className="flex flex-wrap gap-2">
        {canCreate && <M3Button onClick={() => setShowCreate(value => !value)}><Plus className="h-4 w-4" />Novo pedido</M3Button>}
        <M3Button tone="outlined" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Atualizar</M3Button>
      </div>} />
    {error && <p role="alert" className="rounded-control border border-error/30 bg-error/10 p-3 text-error">{error}</p>}
    {notice && <p role="status" className="rounded-control border border-success/30 bg-success/10 p-3 text-text-primary">{notice}</p>}
    {canCreate && showCreate && <M3Card className="overflow-visible border border-border bg-surface p-6 shadow-sm">
      <h3 className="mb-5 text-heading-sm font-bold text-text-primary">Adicionar novo pedido de desenho</h3>
      <form onSubmit={event => void create(event)} className="space-y-5">
        <div className="grid gap-5 text-body-sm font-semibold text-text-secondary md:grid-cols-2">
          <Input label="Nome do pedido" value={title} onChange={event => setTitle(event.target.value)} required minLength={2} maxLength={200} />
          <label className="block">Gestor de projeto *
            <select aria-label="Gestor de projeto" className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-text-primary" value={ownerId}
              onChange={event => { setOwnerId(event.target.value); setCreateOtherManagerIds(ids => ids.filter(id => id !== event.target.value)); }} required>
              <option value="">Selecionar gestor</option>{managerUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select></label>
          <div className="relative md:col-span-2">
            <label htmlFor="design-project-search" className="block">Projeto associado (opcional)</label>
            <div className="relative mt-1">
              <Input id="design-project-search" aria-label="Projeto associado" type="text" role="combobox"
                aria-expanded={showProjectSuggestions} aria-controls="design-project-suggestions" autoComplete="off"
                value={projectSearchQuery} onChange={event => { setProjectSearchQuery(event.target.value); setProjectId(''); setShowProjectSuggestions(true); }}
                onFocus={() => setShowProjectSuggestions(true)} onBlur={() => setTimeout(() => setShowProjectSuggestions(false), 250)}
                placeholder="Pesquisar projeto por nome..." className="w-full pr-9" />
              <Search aria-hidden="true" className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-text-muted" />
            </div>
            {showProjectSuggestions && <div id="design-project-suggestions" role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-control border border-border bg-surface p-1 shadow-lg">
              <button type="button" role="option" aria-selected={!projectId} className="w-full rounded-control p-2 text-left text-body-sm hover:bg-surface-muted"
                onMouseDown={event => event.preventDefault()} onClick={() => { setProjectId(''); setProjectSearchQuery(''); setShowProjectSuggestions(false); }}>Pedido independente</button>
              {projectSuggestions.map(project => <button key={project.id} type="button" role="option" aria-selected={projectId === project.id}
                className="w-full rounded-control p-2 text-left text-body-sm hover:bg-surface-muted" onMouseDown={event => event.preventDefault()}
                onClick={() => selectProject(project)}><span className="block font-semibold">{project.title}</span>
                {project.installProjectNo && <span className="text-caption text-text-muted">{project.installProjectNo}</span>}</button>)}
              {!projectSuggestions.length && <p className="p-2 text-body-sm text-text-muted">Nenhum projeto encontrado</p>}
            </div>}
          </div>
          <Textarea label="Descrição" value={createInstructions} onChange={event => setCreateInstructions(event.target.value)} maxLength={10000} rows={4} />
          <Textarea label="Notas de execução" value={createDeliverables} onChange={event => setCreateDeliverables(event.target.value)} maxLength={10000} rows={4} />
          <Textarea label="Utilização" value={createUsage} onChange={event => setCreateUsage(event.target.value)} maxLength={10000} rows={4} />
          <label className="block">Estado do projeto
            <select aria-label="Estado do projeto" value={createProjectStatusId} onChange={event => setCreateProjectStatusId(event.target.value)}
              className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-text-primary">
              <option value="">Selecionar estado</option>{statusOptions.filter(status => !status.deleted).map(status =>
                <option key={status.id} value={status.id}>{status.name}</option>)}
            </select></label>
          <Input label="Início previsto" type="date" required value={createStartDate} onChange={event => setCreateStartDate(event.target.value)} />
          <Input label="Fim previsto" type="date" required min={createStartDate || undefined} value={createEndDate} onChange={event => setCreateEndDate(event.target.value)} />
          <label className="block">Requisitante
            <select aria-label="Requisitante" value={createRequestedForId} onChange={event => setCreateRequestedForId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-text-primary">
              <option value="">Sem requisitante</option>{allUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select></label>
          <label className="block">Prioridade
            <select aria-label="Prioridade" value={createPriorityId} onChange={event => setCreatePriorityId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-text-primary">
              <option value="">Sem prioridade</option>{priorityOptions.map(priority => <option key={priority.id} value={priority.id}>{priority.name}</option>)}
            </select></label>
          <fieldset className="rounded-control border border-border bg-surface-muted/50 p-4 md:col-span-2"><legend className="px-1 font-semibold">Outros responsáveis</legend>
            <div className="flex flex-wrap gap-3">{managerUsers.filter(user => user.id !== ownerId).map(user =>
              <label key={user.id} className="inline-flex items-center gap-2"><input type="checkbox" checked={createOtherManagerIds.includes(user.id)}
                onChange={() => toggleManager(user.id, true)} />{user.name}</label>)}</div>
          </fieldset>
        </div>
        {managerUsers.length === 0 && <p className="text-caption text-error">Não há gestores de projeto ativos disponíveis para receber o pedido.</p>}
        <div className="flex justify-end gap-2"><M3Button tone="outlined" onClick={() => setShowCreate(false)}>Cancelar</M3Button>
          <M3Button type="submit" isLoading={busy} disabled={!ownerId || !createStartDate || !createEndDate}>Criar pedido</M3Button></div>
      </form>
    </M3Card>}
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <M3Card className="space-y-3 border border-border bg-surface p-4 shadow-sm">
        <div className="border-b border-border pb-3"><h3 className="font-bold text-text-primary">Pedidos de desenho</h3>
          <p className="text-caption text-text-secondary">{total} pedido(s) · selecione para consultar o desenvolvimento</p></div>
        {loading ? <p role="status">A carregar pedidos…</p> : requests.length === 0 ? <p className="text-text-secondary">Ainda não há pedidos de desenho.</p> :
          <div className="space-y-2">{requests.map(request => <button key={request.id} type="button"
            className={`w-full rounded-control border p-3 text-left transition-colors ${selectedId === request.id ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:bg-surface-muted'}`}
            onClick={() => setSelectedId(request.id)}>
            <span className="block font-semibold text-text-primary">{request.title}</span>
            <span className="mt-2 flex flex-wrap items-center gap-2"><Badge variant={statusVariant[request.status]}>{statusLabel[request.status]}</Badge>
              <span className="text-caption text-text-secondary">{request.tasks.length} tarefa(s)</span></span>
            <span className="block text-caption text-text-muted">{nameOf(request.ownerId)} · {request.plannedEndDate || 'Sem prazo'}</span>
          </button>)}{requests.length < total && <M3Button tone="outlined" disabled={busy} onClick={() => void load(page + 1)}>Carregar mais</M3Button>}</div>}
      </M3Card>
      <div>{selected ? <div className="space-y-4">
        <M3Card className="space-y-4 border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-heading-sm font-bold">{selected.title}</h3>
            <p className="mt-1 text-text-secondary">Gestor de projeto: {nameOf(selected.ownerId)}</p>
            {selected.otherManagerIds.length > 0 && <p className="text-caption text-text-secondary">Outros responsáveis: {selected.otherManagerIds.map(nameOf).sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' })).join(', ')}</p>}</div>
            <Badge variant={statusVariant[selected.status]}>{statusLabel[selected.status]}</Badge>
            {selected.projectId && <span className="text-caption">Projeto: {projects.find(project => project.id === selected.projectId)?.title || 'Indisponível'}</span>}</div>
          {canManage && selected.status === 'submitted' && <div className="space-y-3">
            <fieldset className="space-y-1"><legend className="font-medium">Desenhadores da tarefa inicial</legend>
              <div className="flex flex-wrap gap-3">{executorUsers.map(user => <label key={user.id} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={assigneeIds.includes(user.id)} onChange={() => toggleAssignee(user.id)} />{user.name}</label>)}</div></fieldset>
            <Input label="Estimativa da tarefa inicial (dias)" type="number" min="0.5" step="0.5" required value={estimatedDays} onChange={event => setEstimatedDays(event.target.value)} />
            <div className="flex flex-wrap gap-2"><M3Button isLoading={busy} disabled={!assigneeIds.length || Number(estimatedDays) < 0.5} onClick={() => void act({ action: 'accept', version: selected.version, assigneeIds, estimatedDays: Number(estimatedDays) }, 'Pedido aceite e atribuído.')}>Aceitar e atribuir</M3Button>
              <M3Button tone="outlined" disabled={busy} onClick={() => void act({ action: 'reject', version: selected.version }, 'Pedido recusado.')}>Recusar</M3Button></div>
          </div>}
          <div className="grid gap-4 sm:grid-cols-2"><Textarea label="Descrição" value={instructions} disabled={!canEditDetails} onChange={event => setInstructions(event.target.value)} />
            <Textarea label="Notas de execução" value={deliverables} disabled={!canEditDetails} onChange={event => setDeliverables(event.target.value)} />
            <Textarea label="Utilização" value={usage} maxLength={10000} disabled={!canEditDetails} onChange={event => setUsage(event.target.value)} />
            <label className="block text-label font-semibold text-text-secondary">Estado do projeto
              <select aria-label="Estado do projeto" value={projectStatusId} disabled={!canEditDetails}
                onChange={event => setProjectStatusId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-text-primary">
                <option value="">Selecionar estado</option>{statusOptions.filter(status => !status.deleted || status.id === projectStatusId).map(status =>
                  <option key={status.id} value={status.id}>{status.name}</option>)}
              </select></label>
            <Input label="Início previsto" type="date" required disabled={!canEditDetails} value={plannedStartDate} onChange={event => setPlannedStartDate(event.target.value)} />
            <Input label="Fim previsto" type="date" min={plannedStartDate || undefined} disabled={!canEditDetails} value={plannedEndDate} onChange={event => setPlannedEndDate(event.target.value)} />
            <Input label="Identificação do ficheiro" value={fileIdentifier} disabled={!(canManage || (isAssigned && canExecute)) || selected.status !== 'accepted'} onChange={event => setFileIdentifier(event.target.value)} />
            <Input label="Revisão do ficheiro" value={fileRevision} disabled={!(canManage || (isAssigned && canExecute)) || selected.status !== 'accepted'} onChange={event => setFileRevision(event.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-label font-semibold text-text-secondary">Requisitante
              <select aria-label="Requisitante" value={requestedForId} disabled={!canEditDetails} onChange={event => setRequestedForId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-text-primary">
                <option value="">Sem requisitante</option>{allUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select></label>
            <label className="block text-label font-semibold text-text-secondary">Prioridade
              <select aria-label="Prioridade" value={priorityId} disabled={!canEditDetails} onChange={event => setPriorityId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-text-primary">
                <option value="">Sem prioridade</option>{priorityOptions.map(priority => <option key={priority.id} value={priority.id}>{priority.name}</option>)}
              </select></label>
          </div>
          <fieldset className="rounded-control border border-border bg-surface-muted/50 p-4" disabled={!canEditDetails}>
            <legend className="px-1 font-semibold">Outros responsáveis</legend>
            <div className="flex flex-wrap gap-3">{managerUsers.filter(user => user.id !== selected.ownerId).map(user =>
              <label key={user.id} className="inline-flex items-center gap-2"><input type="checkbox" checked={otherManagerIds.includes(user.id)}
                onChange={() => toggleManager(user.id, false)} />{user.name}</label>)}</div>
          </fieldset>
          {canEditDetails && <M3Button tone="outlined" disabled={busy || !plannedStartDate || !plannedEndDate} onClick={() => void act({ action: 'edit', version: selected.version,
            instructions, deliverables, fileIdentifier, fileRevision, plannedStartDate, plannedEndDate,
            usage, projectStatusId: projectStatusId || null, otherManagerIds,
            requestedForId: requestedForId || null, priorityId: priorityId || null }, 'Dados do pedido guardados.')}>Guardar detalhes</M3Button>}
          {isAssigned && canExecute && selected.status === 'accepted' && <M3Button tone="outlined" disabled={busy || !fileIdentifier.trim() || !fileRevision.trim()}
            onClick={() => void act({ action: 'file', version: selected.version, fileIdentifier, fileRevision }, 'Ficheiro e revisão guardados.')}>Guardar ficheiro/revisão</M3Button>}
        </M3Card>
        <M3Card className="space-y-4 p-5"><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /><h3 className="text-heading-sm font-bold">Tarefas de desenvolvimento</h3></div>
          <p className="text-text-secondary">O pedido simples começa com uma única tarefa. Para trabalhos mais complexos, acrescente tarefas sem substituir a inicial.</p>
          {selected.tasks.map(task => {
            const assigned = task.assigneeIds.includes(currentUser.id);
            return <div key={task.id} className="rounded-control border border-border p-3 space-y-2">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{task.title}{task.isInitial ? ' · tarefa inicial' : ''}</p>
                {task.description && <p className="text-text-secondary">{task.description}</p>}</div><span>{taskLabel[task.statusId] || 'Estado desconhecido'}</span></div>
              <p className="text-caption text-text-secondary">Responsáveis: {task.assigneeIds.map(nameOf).sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' })).join(', ') || 'Por atribuir'} · Estimativa: {task.estimatedDays ?? 'por definir'} dia(s)</p>
              {canManage && selected.status === 'accepted' && <div className="space-y-2">
                {assigningTaskId === task.id ? <><fieldset><legend className="text-label font-semibold">Alterar desenhadores</legend>
                  <div className="flex flex-wrap gap-3">{executorUsers.map(user => <label key={user.id} className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={assignmentDraft.includes(user.id)} onChange={() => setAssignmentDraft(current =>
                      current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id])} />{user.name}</label>)}</div></fieldset>
                  <M3Button tone="outlined" disabled={busy || !assignmentDraft.length} onClick={() => void act({ action: 'assign_task', version: selected.version,
                    taskId: task.id, assigneeIds: assignmentDraft }, 'Desenhadores atualizados.').then(result => { if (result) setAssigningTaskId(null); })}>Guardar responsáveis</M3Button></>
                : <M3Button tone="text" disabled={busy} onClick={() => { setAssigningTaskId(task.id); setAssignmentDraft(task.assigneeIds); }}>Alterar responsáveis</M3Button>}
              </div>}
              {selected.status === 'accepted' && ((assigned && canExecute) || (canManage && task.statusId === TASK_STATUS.complete)) && <div className="flex flex-wrap gap-2">
                {assigned && canExecute && task.statusId === TASK_STATUS.pending && <M3Button tone="outlined" disabled={busy} onClick={() => void taskAction(task,'start')}>Iniciar</M3Button>}
                {assigned && canExecute && task.statusId === TASK_STATUS.progress && <><M3Button tone="outlined" disabled={busy} onClick={() => void taskAction(task,'block')}>Bloquear</M3Button><M3Button disabled={busy} onClick={() => void taskAction(task,'complete')}>Concluir</M3Button></>}
                {assigned && canExecute && task.statusId === TASK_STATUS.blocked && <M3Button tone="outlined" disabled={busy} onClick={() => void taskAction(task,'resume')}>Retomar</M3Button>}
                {canReopen && task.statusId === TASK_STATUS.complete && <div className="flex flex-wrap gap-2"><Input aria-label="Justificação da reabertura" placeholder="Motivo da reabertura" value={reopenReason} onChange={event => setReopenReason(event.target.value)} /><M3Button tone="outlined" disabled={busy || reopenReason.trim().length < 5} onClick={() => void taskAction(task,'reopen')}>Reabrir</M3Button></div>}
              </div>}
            </div>;
          })}
          {canManage && selected.status === 'accepted' && <form className="space-y-2 border-t border-border pt-3" onSubmit={event => { event.preventDefault(); void act({ action: 'add_task', version: selected.version,
            title: newTaskTitle, description: newTaskDescription, assigneeIds, estimatedDays: Number(newTaskEstimatedDays) }, 'Tarefa de desenvolvimento acrescentada.').then(result => { if (result) { setNewTaskTitle(''); setNewTaskDescription(''); } }); }}>
            <h4 className="font-semibold">Acrescentar tarefa de desenvolvimento</h4><Input label="Título da tarefa" required minLength={2} value={newTaskTitle} onChange={event => setNewTaskTitle(event.target.value)} />
            <Textarea label="Descrição da tarefa" value={newTaskDescription} onChange={event => setNewTaskDescription(event.target.value)} />
            <Input label="Estimativa (dias, passos de 0,5)" type="number" min="0.5" step="0.5" required value={newTaskEstimatedDays} onChange={event => setNewTaskEstimatedDays(event.target.value)} />
            <fieldset><legend className="text-label font-semibold">Desenhadores</legend><div className="flex flex-wrap gap-3">{executorUsers.map(user => <label key={user.id} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={assigneeIds.includes(user.id)} onChange={() => toggleAssignee(user.id)} />{user.name}</label>)}</div></fieldset>
            <M3Button type="submit" isLoading={busy} disabled={!assigneeIds.length}><Plus className="h-4 w-4" />Acrescentar tarefa</M3Button>
          </form>}
          {selected.status === 'accepted' && allComplete && canExecute && selected.tasks.some(task => task.assigneeIds.includes(currentUser.id)) &&
            <M3Button disabled={busy || !selected.fileIdentifier || !selected.fileRevision} onClick={() => void act({ action: 'deliver', version: selected.version }, 'Entrega confirmada.')}>Confirmar entrega</M3Button>}
          {selected.status === 'delivered' && <p>Entrega confirmada por {nameOf(selected.deliveredBy || '')}.</p>}
        </M3Card>
        <M3Card className="space-y-2 p-5"><h3 className="font-semibold">Histórico</h3>
          {selected.events.length ? <ol className="space-y-1 text-body-sm">{selected.events.map((event,index) =>
            <li key={`${event.occurredAt}-${index}`}>{new Date(event.occurredAt).toLocaleString('pt-PT')} · {nameOf(event.actorId)} · {eventLabel[event.action] || event.action}</li>)}</ol>
            : <p className="text-text-secondary">Sem acontecimentos registados.</p>}
        </M3Card>
      </div> : <M3Card className="p-6 text-text-secondary">Selecione um pedido para ver o desenvolvimento e a entrega.</M3Card>}</div>
    </div>
  </div>;
}
