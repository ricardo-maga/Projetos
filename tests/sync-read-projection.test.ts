import { expect, test } from 'bun:test';
import { projectSyncRead } from '../lib/supabase/syncReadProjection';
import type { ERPState } from '../lib/types';
const fixture = () => ({ projects:[{id:'p'}], tasks:[{id:'t'}], comments:[{id:'c'}],
  automationRules:[{id:'a'}], userAbsences:[{id:'absence'}], auditLogs:[{id:'log'}],
  users:[{id:'u',name:'Self',password:'secret',email:'self@example.com'},
    {id:'other',name:'Other',email:'private@example.com',password:'secret'}],
  taskStatuses:[{id:'status',color:'#123456'}],
  notifications:[{id:'own',userId:'u'},{id:'foreign',userId:'other'},{id:'shared',userId:'all'}],
} as unknown as ERPState);

test('read projection denies operational collections by default and keeps reference labels', () => {
  const state=fixture();
  const result=projectSyncRead(state,'u',new Map());
  expect(result.projects).toEqual([]);
  expect(result.tasks).toEqual([]);
  expect(result.comments).toEqual([]);
  expect(result.automationRules).toEqual([]);
  expect(result.auditLogs).toEqual([]);
  expect(result.userAbsences).toEqual([]);
  expect(result.taskStatuses).toEqual(state.taskStatuses);
  expect(state.projects.length).toBe(1);
  expect(result.users[1].name).toBe('Other');
  expect(result.users[1].email).toBe('');
  expect(result.users.every(user => !('password' in user))).toBe(true);
  expect(result.notifications?.map(row=>row.id)).toEqual(['own','shared']);
});
test('only canonical positive permission decisions expose matching domains', () => {
  const result=projectSyncRead(fixture(),'u',new Map([['projects:read',true],['tasks:read',false]]));
  expect(result.projects.length).toBe(1);
  expect(result.comments.length).toBe(1);
  expect(result.tasks).toEqual([]);
  expect(result.automationRules).toEqual([]);
});
