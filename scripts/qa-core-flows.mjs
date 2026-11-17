import fs from 'node:fs';
import path from 'node:path';
import { state, runtime, expect, request, track, record, ledger } from './qa-session.mjs';

if (ledger.runId !== state.runId) throw new Error('Cannot reuse a ledger from another run');
const prefix = state.runId;
const manager = state.accounts.find(a => a.code === 'PROJECT_MANAGER');
const owner = state.accounts.find(a => a.code === 'SUPER_ADMIN');
try {
  await expect('Anonymous project read denied', '/api/v1/projects', 'GET', undefined, 401, 'ANONYMOUS');
  await expect('Viewer project write denied', '/api/v1/projects', 'POST', {}, 403, 'VIEWER');
  await expect('Viewer client write denied', '/api/v1/clients', 'POST', {}, 403, 'VIEWER');
  await expect('Viewer task write denied', '/api/v1/tasks', 'POST', {}, 403, 'VIEWER');
  const directory = (await expect('Directory references load', '/api/supabase/sync?partition=directory', 'GET')).data;
  for (const key of ['projectCategories', 'projectStatuses', 'taskTypes', 'taskStatuses', 'riskCategories', 'riskStatuses', 'riskPriorities']) directory[key] = directory[key].filter(row => !row.deleted);
  await expect('Invalid client rejected', '/api/v1/clients', 'POST', { clientName: '' }, 422);
  const previousClient = ledger.entities.find(e => e.type === 'client' && !e.deleted);
  const client = previousClient
    ? (await expect('Reuse owned client fixture', `/api/v1/clients/${previousClient.id}`, 'GET')).data
    : track('client', (await expect('Create client', '/api/v1/clients', 'POST', { clientName: `${prefix} Cliente`, shortName: 'QA', notes: 'Synthetic QA only' }, 201)).data);
  const editedClient = (await expect('Edit client', `/api/v1/clients/${client.id}`, 'PATCH', { clientName: `${prefix} Cliente editado`, version: client.version })).data;
  const readClient = (await expect('Read saved client', `/api/v1/clients/${client.id}`, 'GET')).data;
  record('Client edit persisted', readClient.clientName === `${prefix} Cliente editado`);
  await expect('Stale client edit rejected', `/api/v1/clients/${client.id}`, 'PATCH', { notes: 'stale', version: client.version }, 409);
  const project = track('project', (await expect('Create project', '/api/v1/projects', 'POST', { title: `${prefix} Projeto`, clientId: client.id, projectManagerId: manager.id, categoryIds: [directory.projectCategories[0].id], statusId: directory.projectStatuses.find(s => s.scale === 1).id, demo: true, deliveryDate: '2026-12-15', forecastDate: '2026-11-01' }, 201)).data);
  const editedProject = (await expect('Edit project', `/api/v1/projects/${project.id}`, 'PATCH', { title: `${prefix} Projeto editado`, version: project.version })).data;
  const readProject = (await expect('Read saved project', `/api/v1/projects/${project.id}`, 'GET')).data;
  record('Project edit persisted', readProject.title === `${prefix} Projeto editado`);
  await expect('Stale project edit rejected', `/api/v1/projects/${project.id}`, 'PATCH', { title: 'stale', version: project.version }, 409);
  const task = track('task', (await expect('Create task', '/api/v1/tasks', 'POST', { title: `${prefix} Tarefa`, projectId: project.id, taskTypeId: directory.taskTypes[0].id, statusId: directory.taskStatuses[0].id, estimatedHours: 2, estimatedDate: '2026-11-17', assignedUserIds: [manager.id] }, 201)).data);
  const editedTask = (await expect('Edit task', `/api/v1/tasks/${task.id}`, 'PATCH', { title: `${prefix} Tarefa editada`, version: task.version })).data;
  const readTask = (await expect('Read saved task', `/api/v1/tasks/${task.id}`, 'GET')).data;
  record('Task edit and assignment persisted', readTask.title === `${prefix} Tarefa editada`);
  await expect('Stale task edit rejected', `/api/v1/tasks/${task.id}`, 'PATCH', { title: 'stale', version: task.version }, 409);
  const material = track('material', (await expect('Create material', '/api/v1/project-materials', 'POST', { projectId: project.id, description: `${prefix} Material`, supplier: 'Fornecedor fictício QA', quantity: 2 }, 201)).data);
  await expect('Edit material', `/api/v1/project-materials/${material.id}`, 'PUT', { description: `${prefix} Material editado`, quantity: 3, syncVersion: material.syncVersion });
  const materials = (await expect('Read saved materials', `/api/v1/project-materials?projectId=${project.id}`, 'GET')).data;
  record('Material edit persisted', materials.some(m => m.id === material.id && m.quantity === 3));
  const riskInput = { projectId: project.id, title: `${prefix} Risco`, identificationDate: '2026-11-16', probability: 2, impact: 3, ownerId: manager.id, categoryId: directory.riskCategories[0]?.id || '', statusId: directory.riskStatuses[0]?.id || '', priorityId: directory.riskPriorities[0]?.id || '' };
  const risk = track('risk', (await expect('Create risk', '/api/v1/projects/risks', 'POST', riskInput, 201)).data);
  const editedRisk = (await expect('Edit risk', `/api/v1/projects/risks/${risk.id}`, 'PATCH', { ...riskInput, title: `${prefix} Risco editado`, impact: 4, syncVersion: risk.syncVersion })).data;
  await expect('Stale risk edit rejected', `/api/v1/projects/risks/${risk.id}`, 'PATCH', { ...riskInput, syncVersion: risk.syncVersion }, 409);
  const comment = track('comment', (await expect('Create project comment', '/api/v1/projects/comments', 'POST', { projectId: project.id, comment: `**${prefix}** Comentário de teste` }, 201)).data);
  await expect('Unknown absence reason rejected', '/api/v1/absences', 'POST', { userId: manager.id, absenceStartDate: '2026-11-18', absenceEndDate: '2026-11-18', reason: 'invalid' }, 400);
  const absence = track('absence', (await expect('Create absence', '/api/v1/absences', 'POST', { userId: manager.id, absenceStartDate: '2026-11-18', absenceEndDate: '2026-11-18', reason: 'Other' }, 201)).data);
  fs.writeFileSync(path.join(runtime, 'core-fixtures.json'), JSON.stringify({ project, editedProject, client: editedClient, task: editedTask, material, risk: editedRisk, comment, absence, ownerId: owner.id, managerId: manager.id }, null, 2));
  record('Core populated fixtures ready for visual QA', true);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
