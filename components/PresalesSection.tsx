'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { Project, User } from '../lib/types';
import type { PresalesDocument, PresalesRequest, PresalesTask } from '../lib/presales';
import { CANONICAL_ROLE_IDS, hasPermission, normalizeRoleId } from '../lib/permissions';
import { getAuthHeaders } from '../lib/clientAuth';
import { M3Button, M3Card, M3SectionHeader } from './M3';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import Textarea from './ui/Textarea';
import PresalesRichText from './PresalesRichText';

const statusLabel: Record<PresalesRequest['status'], string> = {
  submitted: 'Por aceitar', accepted: 'Em preparação', suspended: 'Suspenso', won: 'Ganho', lost: 'Perdido',
};
const taskStatus: Record<string, string> = {
  '99999999-9999-9999-9999-999999999901': 'Pendente',
  '99999999-9999-9999-9999-999999999902': 'Em curso',
  '99999999-9999-9999-9999-999999999903': 'Concluída',
  '99999999-9999-9999-9999-999999999904': 'Bloqueada',
};
type PresalesBlock = PresalesDocument['blocks'][number];
type Props = { currentUser: User; users: User[]; projects: Project[]; initialRequestId?: string | null;
  onTasksChanged: () => Promise<unknown> };

export default function PresalesSection({ currentUser, users, projects, initialRequestId, onTasksChanged }: Props) {
  const [requests, setRequests] = useState<PresalesRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string|null>(initialRequestId || null);
  const [eligibleManagerIds, setEligibleManagerIds] = useState<string[]>([]);
  const [eligibleExecutorIds, setEligibleExecutorIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const inFlight = useRef(false);
  const createKey = useRef(crypto.randomUUID());
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [requirements, setRequirements] = useState('');
  const [outcome, setOutcome] = useState('');
  const [commercialManagerId, setCommercialManagerId] = useState('');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [document, setDocument] = useState<PresalesDocument>({ schemaVersion: 1, blocks: [] });
  const [itemDraft, setItemDraft] = useState({ id: '', title: '', unit: 'un', quantity: '1', unitPrice: '0', groupLabel: '' });
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [estimatedDays, setEstimatedDays] = useState('1');
  const [reopenReason, setReopenReason] = useState('');
  const [projectToLink, setProjectToLink] = useState('');
  const [selectedRevision, setSelectedRevision] = useState<number|null>(null);
  const selected = requests.find(request => request.id === selectedId) || null;
  const canCreate = hasPermission(currentUser, 'presales_create');
  const canManage = Boolean(selected && hasPermission(currentUser, 'presales_manage') &&
    (selected.ownerId === currentUser.id || hasPermission(currentUser, 'presales_coordinate')));
  const canExecute = hasPermission(currentUser, 'presales_execute');
  const sortedUsers = [...users].filter(user => !user.deleted && user.approved && user.type !== 'External')
    .sort((a,b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
  const managers = sortedUsers.filter(user => eligibleManagerIds.includes(user.id));
  const executors = sortedUsers.filter(user => eligibleExecutorIds.includes(user.id));
  const hasRole = (user: User, roleId: string) => (user.roleIds?.length ? user.roleIds : [user.roleId])
    .some(candidate => normalizeRoleId(candidate) === roleId);
  const commercialUsers = sortedUsers.filter(user => hasRole(user,CANONICAL_ROLE_IDS.COMMERCIAL));
  const projectManagers = sortedUsers.filter(user => hasRole(user,CANONICAL_ROLE_IDS.PROJECT_MANAGER));
  const nameOf = (id: string|null) => sortedUsers.find(user => user.id === id)?.name || '—';

  const load = useCallback(async (targetPage = 1) => {
    try {
      const response = await fetch(`/api/v1/presales?page=${targetPage}`, { cache: 'no-store', headers: getAuthHeaders() });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Falha ao consultar Presales.');
      setRequests(current => targetPage === 1 ? result.data : [...current, ...result.data.filter((row: PresalesRequest) =>
        !current.some(existing => existing.id === row.id))]);
      setEligibleManagerIds(result.eligibleManagerIds || []);
      setEligibleExecutorIds(result.eligibleExecutorIds || []);
      setPage(targetPage); setTotal(result.total); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao consultar Presales.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (initialRequestId) setSelectedId(initialRequestId); }, [initialRequestId]);
  useEffect(() => {
    if (!initialRequestId || requests.some(request => request.id === initialRequestId)) return;
    let cancelled = false;
    void fetch(`/api/v1/presales/${initialRequestId}`, { cache: 'no-store', headers: getAuthHeaders() })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!cancelled && result?.success) setRequests(current =>
        current.some(request => request.id === initialRequestId) ? current : [result.data, ...current]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialRequestId, requests]);
  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title); setOwnerId(selected.ownerId); setStart(selected.plannedStartDate); setEnd(selected.plannedEndDate);
    setRequirements(selected.requirements); setOutcome(selected.outcome);
    setCommercialManagerId(selected.commercialManagerId || ''); setProjectManagerId(selected.projectManagerId || '');
    setDocument(selected.document); setSelectedRevision(null);
    setItemDraft({ id:'',title:'',unit:'un',quantity:'1',unitPrice:'0',groupLabel:'' });
  }, [selected]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/v1/presales', { method: 'POST',
        headers: getAuthHeaders({ 'Idempotency-Key': createKey.current }),
        body: JSON.stringify({ title, ownerId, plannedStartDate: start, plannedEndDate: end,
          requirements, outcome, commercialManagerId: commercialManagerId || null,
          projectManagerId: projectManagerId || null }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível criar Presales.');
      createKey.current = crypto.randomUUID(); setSelectedId(result.data.id); setShowCreate(false);
      await load(); setNotice('Presales criado com uma tarefa inicial.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro de gravação.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!selected || inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/v1/presales/${selected.id}`, { method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ action, version: selected.version, ...payload }) });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status === 409) {
          const fresh = await fetch(`/api/v1/presales/${selected.id}`, { cache: 'no-store', headers: getAuthHeaders() });
          const latest = await fresh.json().catch(() => null);
          if (fresh.ok && latest?.success) setRequests(current => [latest.data, ...current.filter(row => row.id !== selected.id)]);
        }
        throw new Error(result.message || 'Não foi possível guardar.');
      }
      setRequests(current => [result.data, ...current.filter(row => row.id !== selected.id)]);
      try { await onTasksChanged(); } catch { /* The saved response remains authoritative. */ }
      setNotice('Alteração guardada.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro de gravação.'); return false; }
    finally { inFlight.current = false; setBusy(false); }
  };
  const taskAction = async (task: PresalesTask, taskAction: 'start'|'block'|'resume'|'complete'|'reopen') => {
    const saved = await act('task_action', { taskId: task.id, taskVersion: task.version, taskAction,
      ...(taskAction === 'reopen' ? { reason: reopenReason } : {}) });
    if (saved) setReopenReason('');
  };
  const setBlock = (id: string, update: Partial<PresalesBlock>) => setDocument(current => ({ ...current,
    blocks: current.blocks.map(block => block.id === id ? { ...block, ...update } as PresalesBlock : block) }));
  const moveBlock = (index: number, direction: -1|1) => setDocument(current => {
    const blocks = [...current.blocks]; const next = index + direction;
    if (next < 0 || next >= blocks.length) return current;
    [blocks[index], blocks[next]] = [blocks[next], blocks[index]];
    return { ...current, blocks };
  });
  const addBlock = (type: 'rich_text'|'item_summary') => setDocument(current => ({ ...current, blocks: [...current.blocks,
    type === 'rich_text' ? { id: crypto.randomUUID(), type, title: 'Nova secção', content: '' }
      : { id: crypto.randomUUID(), type, title: 'Resumo de materiais e serviços', itemIds: [], displayLabel: '' }] }));
  const uploadImage = async (file: File) => {
    if (!selected || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file',file);
      const headers = getAuthHeaders(); delete headers['Content-Type'];
      const response = await fetch(`/api/v1/presales/${selected.id}/assets`, { method:'POST', headers, body:form });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível guardar a imagem.');
      setDocument(current => ({ ...current, blocks: [...current.blocks,
        { id: crypto.randomUUID(), type:'image', title:file.name.slice(0,200) || 'Imagem',
          assetId:result.data.id, caption:'' }] }));
      setNotice('Imagem carregada. Guarde o rascunho para a incluir na proposta.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar imagem.'); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <div className="space-y-5">
    <M3SectionHeader title="Presales" description="Pedidos técnicos, proposta e resultado."
      actions={<div className="flex gap-2">{canCreate && <M3Button onClick={() => { setSelectedId(null); setShowCreate(true); setTitle(''); setRequirements(''); setOutcome(''); setStart(''); setEnd(''); }}><Plus className="h-4 w-4" />Novo Presales</M3Button>}
        <M3Button tone="outlined" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Atualizar</M3Button></div>} />
    {error && <p role="alert" className="rounded-control border border-error/30 bg-error/10 p-3 text-error">{error}</p>}
    {notice && <p role="status" className="rounded-control border border-success/30 bg-success/10 p-3">{notice}</p>}
    {showCreate && <M3Card className="border border-border bg-surface p-6 shadow-sm">
      <h3 className="mb-4 text-heading-sm font-bold">Novo pedido Presales</h3>
      <form onSubmit={event => void create(event)} className="grid gap-4 md:grid-cols-2">
        <Input label="Nome do pedido" value={title} onChange={event => setTitle(event.target.value)} minLength={2} maxLength={200} required />
        <label className="text-body-sm font-semibold">Responsável Presales *<select aria-label="Responsável Presales" required value={ownerId}
          onChange={event => setOwnerId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3">
          <option value="">Selecionar</option>{managers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <Input label="Início previsto" type="date" required value={start} onChange={event => setStart(event.target.value)} />
        <Input label="Prazo previsto" type="date" required min={start || undefined} value={end} onChange={event => setEnd(event.target.value)} />
        <Textarea label="Requisitos técnicos" value={requirements} onChange={event => setRequirements(event.target.value)} rows={4} maxLength={10000} />
        <Textarea label="Resultado técnico esperado" value={outcome} onChange={event => setOutcome(event.target.value)} rows={4} maxLength={10000} />
        <label className="text-body-sm font-semibold">Gestor comercial do cliente<select aria-label="Gestor comercial do cliente" value={commercialManagerId}
          onChange={event => setCommercialManagerId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3">
          <option value="">Sem contacto</option>{commercialUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label className="text-body-sm font-semibold">Gestor de projeto<select aria-label="Gestor de projeto" value={projectManagerId}
          onChange={event => setProjectManagerId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3">
          <option value="">Sem contacto</option>{projectManagers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <div className="flex justify-end gap-2 md:col-span-2"><M3Button tone="outlined" onClick={() => setShowCreate(false)}>Cancelar</M3Button>
          <M3Button type="submit" isLoading={busy} disabled={!ownerId || !start || !end}>Criar pedido</M3Button></div>
      </form>
    </M3Card>}
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <M3Card className="space-y-3 border border-border bg-surface p-4 shadow-sm">
        <div className="border-b border-border pb-3"><h3 className="font-bold">Pedidos Presales</h3>
          <p className="text-caption text-text-secondary">{total} pedido(s)</p></div>
        {requests.length === 0 ? <p className="text-text-secondary">Ainda não há pedidos Presales.</p> : requests.map(request =>
          <button key={request.id} type="button" onClick={() => { setSelectedId(request.id); setShowCreate(false); }}
            className={`w-full rounded-control border p-3 text-left hover:bg-surface-muted ${selectedId === request.id ? 'border-primary bg-primary/10' : 'border-border'}`}>
            <span className="block font-semibold">{request.title}</span><span className="mt-2 block"><Badge variant={request.status === 'won' ? 'success' : request.status === 'lost' ? 'error' : 'primary'}>{statusLabel[request.status]}</Badge></span>
            <span className="block text-caption text-text-secondary">{nameOf(request.ownerId)} · {request.plannedEndDate}</span>
          </button>)}
        {requests.length < total && <M3Button tone="outlined" onClick={() => void load(page + 1)}>Carregar mais</M3Button>}
      </M3Card>
      {selected && <div className="space-y-4">
        <M3Card className="space-y-4 border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-heading-sm font-bold">{selected.title}</h3>
            <Badge variant={selected.status === 'won' ? 'success' : selected.status === 'lost' ? 'error' : 'primary'}>{statusLabel[selected.status]}</Badge></div>
          <p className="text-body-sm text-text-secondary">Responsável: {nameOf(selected.ownerId)} · Prazo: {selected.plannedStartDate} — {selected.plannedEndDate}</p>
          <div className="grid gap-4 md:grid-cols-2"><Input label="Nome do pedido" value={title} disabled={!canManage} onChange={event => setTitle(event.target.value)} />
            <Input label="Início previsto" type="date" value={start} disabled={!canManage} onChange={event => setStart(event.target.value)} />
            <Input label="Prazo previsto" type="date" value={end} disabled={!canManage} onChange={event => setEnd(event.target.value)} />
            <Textarea label="Requisitos técnicos" value={requirements} disabled={!canManage} onChange={event => setRequirements(event.target.value)} />
            <Textarea label="Resultado técnico" value={outcome} disabled={!canManage} onChange={event => setOutcome(event.target.value)} />
            <label className="text-body-sm font-semibold">Gestor comercial do cliente<select aria-label="Gestor comercial do cliente" value={commercialManagerId} disabled={!canManage}
              onChange={event => setCommercialManagerId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3">
              <option value="">Sem contacto</option>{commercialUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
            <label className="text-body-sm font-semibold">Gestor de projeto<select aria-label="Gestor de projeto" value={projectManagerId} disabled={!canManage}
              onChange={event => setProjectManagerId(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3">
              <option value="">Sem contacto</option>{projectManagers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></div>
          {canManage && ['submitted','accepted','suspended'].includes(selected.status) && <M3Button tone="outlined" disabled={busy || !start || !end}
            onClick={() => void act('edit', { title, plannedStartDate: start, plannedEndDate: end, requirements, outcome,
              commercialManagerId: commercialManagerId || null, projectManagerId: projectManagerId || null })}>Guardar dados</M3Button>}
          {canManage && <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {selected.status === 'submitted' && <M3Button disabled={busy || !assigneeIds.length} onClick={() => void act('accept', { assigneeIds, estimatedDays: Number(estimatedDays) })}>Aceitar pedido</M3Button>}
            {selected.status === 'accepted' && <><M3Button tone="outlined" disabled={busy} onClick={() => void act('suspend')}>Suspender</M3Button>
              <M3Button disabled={busy} onClick={() => void act('won')}>Ganho</M3Button>
              <M3Button tone="outlined" disabled={busy} onClick={() => void act('lost')}>Perdido</M3Button></>}
            {selected.status === 'suspended' && <><M3Button disabled={busy} onClick={() => void act('resume')}>Retomar</M3Button>
              <M3Button disabled={busy} onClick={() => void act('won')}>Ganho</M3Button>
              <M3Button tone="outlined" disabled={busy} onClick={() => void act('lost')}>Perdido</M3Button></>}
          </div>}
        </M3Card>
        <M3Card className="space-y-4 border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-heading-sm font-bold">Trabalho técnico</h3>
          {canManage && selected.status === 'submitted' && <p className="text-body-sm text-text-secondary">Escolhe executores e estimativa para aceitar a tarefa inicial.</p>}
          {selected.tasks.map(task => <div key={task.id} className="rounded-control border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{task.title}</strong><Badge variant="primary">{taskStatus[task.statusId] || 'Estado'}</Badge></div>
            <p className="mt-1 text-body-sm text-text-secondary">{task.description || 'Sem instruções adicionais'} · {task.estimatedDays ?? '—'} dia(s)</p>
            <p className="mt-1 text-caption text-text-muted">{task.assigneeIds.map(nameOf).join(', ') || 'Sem responsável atribuído'}</p>
            {selected.status === 'accepted' && <div className="mt-3 flex flex-wrap gap-2">
              {canExecute && task.assigneeIds.includes(currentUser.id) && task.statusId === '99999999-9999-9999-9999-999999999901' && <M3Button disabled={busy} onClick={() => void taskAction(task,'start')}>Iniciar</M3Button>}
              {canExecute && task.assigneeIds.includes(currentUser.id) && task.statusId === '99999999-9999-9999-9999-999999999902' && <M3Button tone="outlined" disabled={busy} onClick={() => void taskAction(task,'block')}>Bloquear</M3Button>}
              {canExecute && task.assigneeIds.includes(currentUser.id) && task.statusId === '99999999-9999-9999-9999-999999999904' && <M3Button tone="outlined" disabled={busy} onClick={() => void taskAction(task,'resume')}>Retomar</M3Button>}
              {canExecute && task.assigneeIds.includes(currentUser.id) && ['99999999-9999-9999-9999-999999999902','99999999-9999-9999-9999-999999999904'].includes(task.statusId) && <M3Button disabled={busy} onClick={() => void taskAction(task,'complete')}>Concluir</M3Button>}
              {canManage && task.statusId === '99999999-9999-9999-9999-999999999903' && <><Input aria-label="Justificação para reabrir" value={reopenReason} onChange={event => setReopenReason(event.target.value)} placeholder="Justificação para reabrir" />
                <M3Button tone="outlined" disabled={busy || reopenReason.trim().length < 5} onClick={() => void taskAction(task,'reopen')}>Reabrir</M3Button></>}
            </div>}
          </div>)}
          {canManage && ['submitted','accepted'].includes(selected.status) && <div className="space-y-3 border-t border-border pt-4">
            <label className="block text-body-sm font-semibold">Executores</label>
            <div className="flex flex-wrap gap-3">{executors.map(user => <label key={user.id} className="inline-flex items-center gap-2 text-body-sm">
              <input type="checkbox" checked={assigneeIds.includes(user.id)} onChange={() => setAssigneeIds(current => current.includes(user.id)
                ? current.filter(id => id !== user.id) : [...current,user.id])} />{user.name}</label>)}</div>
            <Input label="Estimativa (dias ou meios dias)" type="number" step="0.5" min="0.5" value={estimatedDays} onChange={event => setEstimatedDays(event.target.value)} />
            {selected.status === 'accepted' && <><Input label="Nova tarefa" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} />
              <Textarea label="Descrição da tarefa" value={taskDescription} onChange={event => setTaskDescription(event.target.value)} />
              <M3Button disabled={busy || !taskTitle.trim() || !assigneeIds.length} onClick={() => void act('add_task', { title: taskTitle,
                description: taskDescription, assigneeIds, estimatedDays: Number(estimatedDays) }).then(saved => {
                  if (saved) { setTaskTitle(''); setTaskDescription(''); }
                })}><Plus className="h-4 w-4" />Acrescentar tarefa</M3Button></>}
          </div>}
        </M3Card>
        <M3Card className="space-y-4 border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-heading-sm font-bold">Conteúdo da proposta</h3>
            <p className="text-caption text-text-secondary">Secções ordenáveis e revisões preservadas.</p></div>
            {canManage && (selected.documentLocked ? <M3Button disabled={busy} onClick={() => void act('new_revision')}>Criar nova revisão</M3Button>
              : <M3Button disabled={busy} onClick={() => void act('publish')}>Publicar revisão</M3Button>)}</div>
          {selectedRevision !== null && <p className="rounded-control bg-primary/10 p-3 text-body-sm">A consultar a revisão publicada {selectedRevision}. A edição mantém-se no rascunho.</p>}
          {(selectedRevision === null ? document.blocks : selected.revisions.find(revision => revision.revisionNumber === selectedRevision)?.documentSnapshot.blocks || []).map((block,index) =>
            <div key={block.id} className="space-y-2 rounded-control border border-border p-4">
              <div className="flex items-center gap-2"><Input aria-label="Título da secção" value={block.title} disabled={!canManage || selected.documentLocked || selectedRevision !== null}
                onChange={event => setBlock(block.id,{ title: event.target.value })} />
                {canManage && !selected.documentLocked && selectedRevision === null && <><button type="button" aria-label="Subir secção" onClick={() => moveBlock(index,-1)}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label="Descer secção" onClick={() => moveBlock(index,1)}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" aria-label="Remover secção" onClick={() => setDocument(current => ({ ...current, blocks: current.blocks.filter(item => item.id !== block.id) }))}><Trash2 className="h-4 w-4" /></button></>}</div>
              {block.type === 'rich_text' && <PresalesRichText value={block.content}
                readOnly={!canManage || selected.documentLocked || selectedRevision !== null}
                onChange={value => setBlock(block.id,{ content:value })} />}
              {block.type === 'item_summary' && <><Input label="Designação no documento" value={block.displayLabel}
                disabled={!canManage || selected.documentLocked || selectedRevision !== null} onChange={event => setBlock(block.id,{ displayLabel: event.target.value })} />
                <div className="flex flex-wrap gap-2">{(selectedRevision === null ? selected.items : selected.revisions.find(revision => revision.revisionNumber === selectedRevision)?.itemsSnapshot || []).map(item => <label key={item.id} className="inline-flex items-center gap-2 text-body-sm">
                  <input type="checkbox" disabled={!canManage || selected.documentLocked || selectedRevision !== null}
                    checked={block.itemIds.includes(item.id)} onChange={() => setBlock(block.id,{ itemIds: block.itemIds.includes(item.id)
                      ? block.itemIds.filter(id => id !== item.id) : [...block.itemIds,item.id] })} />{item.title}</label>)}</div>
                <p className="text-caption text-text-secondary">Total líquido: {(selectedRevision === null ? selected.items : selected.revisions.find(revision => revision.revisionNumber === selectedRevision)?.itemsSnapshot || []).filter(item => block.itemIds.includes(item.id))
                  .reduce((sum,item) => sum+item.total,0).toFixed(2)}</p></>}
              {block.type === 'image' && <><Image alt={block.caption || block.title} src={`/api/v1/presales/${selected.id}/assets/${block.assetId}`}
                width={800} height={500} unoptimized className="max-h-80 max-w-full rounded-control object-contain" />
                <Input label="Legenda" value={block.caption} disabled={!canManage || selected.documentLocked || selectedRevision !== null}
                  onChange={event => setBlock(block.id,{caption:event.target.value})} /></>}
            </div>)}
          {canManage && !selected.documentLocked && selectedRevision === null && <div className="flex flex-wrap gap-2">
            <M3Button tone="outlined" onClick={() => addBlock('rich_text')}>Adicionar secção de texto</M3Button>
            <M3Button tone="outlined" onClick={() => addBlock('item_summary')}>Adicionar resumo de linhas</M3Button>
            <label className="inline-flex cursor-pointer items-center rounded-control border border-border px-4 py-2 text-body-sm font-semibold">
              Adicionar imagem<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy}
                onChange={event => { const file=event.target.files?.[0]; if (file) void uploadImage(file); event.target.value=''; }} /></label>
            <M3Button disabled={busy} onClick={() => void act('save_document',{document})}>Guardar rascunho</M3Button></div>}
          {selected.revisions.length > 0 && <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <M3Button tone="outlined" onClick={() => setSelectedRevision(null)}>Rascunho</M3Button>
            {selected.revisions.map(revision => <M3Button key={revision.id} tone="outlined" onClick={() => setSelectedRevision(revision.revisionNumber)}>
              Revisão {revision.revisionNumber}</M3Button>)}</div>}
        </M3Card>
        <M3Card className="space-y-4 border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-heading-sm font-bold">Material e serviços</h3>
          <div className="overflow-x-auto"><table className="w-full text-left text-body-sm"><thead><tr><th>Grupo</th><th>Descrição</th><th>Qtd.</th><th>Un.</th><th>Preço líq.</th><th>Total</th><th /></tr></thead>
            <tbody>{selected.items.map(item => <tr key={item.id} className="border-t border-border"><td>{item.groupLabel}</td><td>{item.title}</td><td>{item.quantity}</td><td>{item.unit}</td><td>{item.unitPrice.toFixed(2)}</td><td>{item.total.toFixed(2)}</td>
              <td>{canManage && !selected.documentLocked && <div className="flex gap-2"><button type="button" disabled={busy}
                onClick={() => setItemDraft({ id:item.id,title:item.title,unit:item.unit,quantity:String(item.quantity),
                  unitPrice:String(item.unitPrice),groupLabel:item.groupLabel })}>Editar</button>
                <button type="button" aria-label={`Apagar ${item.title}`} disabled={busy}
                  onClick={() => void act('delete_item',{id:item.id})}><Trash2 className="h-4 w-4" /></button></div>}</td></tr>)}</tbody></table></div>
          {canManage && !selected.documentLocked && <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Descrição" value={itemDraft.title} onChange={event => setItemDraft(current => ({...current,title:event.target.value}))} />
            <Input label="Grupo" value={itemDraft.groupLabel} onChange={event => setItemDraft(current => ({...current,groupLabel:event.target.value}))} />
            <Input label="Quantidade" type="number" min="0.001" step="0.001" value={itemDraft.quantity} onChange={event => setItemDraft(current => ({...current,quantity:event.target.value}))} />
            <Input label="Unidade" value={itemDraft.unit} onChange={event => setItemDraft(current => ({...current,unit:event.target.value}))} />
            <Input label="Preço líquido" type="number" min="0" step="0.01" value={itemDraft.unitPrice} onChange={event => setItemDraft(current => ({...current,unitPrice:event.target.value}))} />
            <M3Button disabled={busy || !itemDraft.title.trim()} onClick={() => void act('save_item',{ id:itemDraft.id || undefined,
              title:itemDraft.title,unit:itemDraft.unit,
              quantity:Number(itemDraft.quantity),unitPrice:Number(itemDraft.unitPrice),groupLabel:itemDraft.groupLabel,
              sortOrder:itemDraft.id ? selected.items.find(item => item.id === itemDraft.id)?.sortOrder || 0 : selected.items.length }).then(saved => {
                if (saved) setItemDraft({ id:'',title:'',unit:'un',quantity:'1',unitPrice:'0',groupLabel:'' });
              })}>{itemDraft.id ? 'Guardar linha' : 'Adicionar linha'}</M3Button>
          </div>}
        </M3Card>
        {selected.status === 'won' && <M3Card className="space-y-3 border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-heading-sm font-bold">Projeto de execução</h3>
          <p className="text-body-sm text-text-secondary">O projeto é criado separadamente. A associação mantém o histórico Presales sem copiar tarefas.</p>
          {selected.executionProjectId ? <p>Projeto associado: {projects.find(project => project.id === selected.executionProjectId)?.title || selected.executionProjectId}</p>
            : canManage && <div className="flex flex-wrap gap-2"><select aria-label="Projeto de execução" value={projectToLink}
              onChange={event => setProjectToLink(event.target.value)} className="rounded-control border border-border bg-surface p-3">
              <option value="">Selecionar projeto existente</option>{projects.filter(project => !project.deleted).map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
              <M3Button disabled={busy || !projectToLink} onClick={() => void act('link_project',{projectId:projectToLink})}>Associar</M3Button></div>}
        </M3Card>}
      </div>}
    </div>
  </div>;
}
