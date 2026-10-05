import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ADMIN_SYNC_FIELDS, stripAdministrativeSyncFields, changedSyncRecords, SYNC_DOMAIN_PERMISSIONS, isOwnNotificationReadChange } from '../lib/supabase/syncPayload';

test('notification recipients may change only their own read flag', () => {
  const old = {id:'n',userId:'u',title:'Original',isRead:false};
  expect(isOwnNotificationReadChange({...old,isRead:true},[old],'u')).toBe(true);
  expect(isOwnNotificationReadChange({...old,isRead:true,title:'Injected'},[old],'u')).toBe(false);
  expect(isOwnNotificationReadChange({...old,isRead:true},[old],'other')).toBe(false);
  expect(isOwnNotificationReadChange({...old,isRead:true},[],'u')).toBe(false);
});

test('snapshot omission and ordering do not delete or rewrite existing records', () => {
  const baseline = [{id:'a',comment:'A'},{id:'b',comment:'B'}];
  expect(changedSyncRecords([baseline[1]],baseline)).toEqual([]);
  expect(changedSyncRecords([],baseline)).toEqual([]);
  expect(changedSyncRecords([{comment:'B',id:'b'},baseline[0]],baseline)).toEqual([]);
  expect(changedSyncRecords([{id:'a',comment:'Changed'}],baseline)).toEqual([{id:'a',comment:'Changed'}]);
  expect(() => changedSyncRecords([{id:'a'},{id:'a'}],baseline)).toThrow();
  expect(SYNC_DOMAIN_PERMISSIONS.tickets).toEqual(['tickets:write','tickets:delete']);
});

test('writer does not infer deletes from snapshot ids', () => {
  const writer = readFileSync(new URL('../lib/supabaseSync.ts', import.meta.url), 'utf8');
  expect(writer).not.toContain('commentIdsToDelete');
  expect(writer).not.toContain('absenceIdsToDelete');
  expect(writer).not.toContain('specialDayIdsToDelete');
  expect(writer).not.toContain('defaultTaskIdsToDelete');
});

test('non-admin snapshots cannot retain any administrative reference entity', () => {
  const state: Record<string, unknown> = Object.fromEntries(ADMIN_SYNC_FIELDS.map(key => [key, [{ id: 'tampered' }]]));
  state.comments = [{ id: 'comment' }];
  stripAdministrativeSyncFields(state);
  expect(Object.keys(state)).toEqual(['comments']);
  expect(ADMIN_SYNC_FIELDS).toContain('taskStatuses');
  expect(ADMIN_SYNC_FIELDS).toContain('projectStatuses');
  expect(ADMIN_SYNC_FIELDS).toContain('specialDays');
});

test('absence lookup failure stops before persistence and omitted branding is not written', () => {
  const route = readFileSync(new URL('../app/api/supabase/sync/route.ts', import.meta.url), 'utf8');
  expect(route).toContain('absenceError || !Array.isArray(dbOtherAbsences)');
  expect(route.indexOf("throw new AuthError('Não foi possível validar a proteção das ausências.', 503)")).toBeLessThan(route.indexOf('saveActiveStateToSupabase(state, clientToUse)'));
  const writer = readFileSync(new URL('../lib/supabaseSync.ts', import.meta.url), 'utf8');
  expect(writer).toContain("state.appConfig ? supabase.from('app_configuration')");
});
