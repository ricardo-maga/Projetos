import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { applicableRequirement, readiness, type ProjectRequirement } from '../lib/planning/requirements.ts';

const project = { id: 'p', categoryId: 'c', categoryIds: [], installProjectNo: null, sfOpportunityNo: null };
const required: ProjectRequirement = { id: 'r', categoryId: 'c', defaultTaskId: 'd',
  necessity: 'mandatory', conditionCode: null, active: true, sortOrder: 0, version: 1 };

test('requisito obrigatório só conta quando a categoria corresponde', () => {
  assert.equal(applicableRequirement(required, project), true);
  assert.equal(applicableRequirement({ ...required, categoryId: 'other' }, project), false);
  assert.equal(readiness(project, [required], [], []).missing, 1);
});

test('condição é avaliada com campo estável e dispensa não é tarefa existente', () => {
  const conditional = { ...required, necessity: 'conditional' as const,
    conditionCode: 'install_project_no' as const };
  assert.equal(applicableRequirement(conditional, project), false);
  const ready = readiness({ ...project, installProjectNo: 'IP-42' }, [conditional],
    [{ projectId: 'p', requirementId: 'r', taskId: null, waived: true,
      reason: 'Dispensado pelo coordenador', version: 1 }], []);
  assert.equal(ready.waived, 1);
  assert.equal(ready.missing, 0);
});

test('tarefa eliminada volta a constar em falta', () => {
  const ready = readiness(project, [required],
    [{ projectId: 'p', requirementId: 'r', taskId: 't', waived: false, reason: null, version: 2 }],
    [{ id: 't', deleted: true, assigneeIds: ['u'], estimatedDate: '2026-11-02' }]);
  assert.equal(ready.missing, 1);
  assert.equal(ready.completed, 0);
});
