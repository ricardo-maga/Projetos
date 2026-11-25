import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { writeDomainChanges } from '../lib/supabase/writeDomainChanges';
import type { ERPState } from '../lib/types';
const settings = JSON.parse(readFileSync(process.env.LOCAL_SUPABASE_STATUS_FILE || '.baseline-local-status.json', 'utf8'));
const url = new URL(settings.API_URL);
if (!['127.0.0.1','localhost'].includes(url.hostname) || url.protocol !== 'http:') throw Error('Local database required');
const db = createClient(url.href, settings.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const userId = randomUUID(), projectId = randomUUID();
const ids: Array<[string, string]> = [];
function checked(result: any) { if (result.error) throw result.error; return result.data; }
async function write(field: string, row: any) {
  const result = await writeDomainChanges({ [field]: [row] } as unknown as ERPState, db);
  assert.equal(result.success, true, result.message);
  return result.versions?.[field]?.[row.id];
}
try {
  checked(await db.from('users').insert({ id: userId, name: 'Synthetic local QA', type: 'Team', approved: true }));
  checked(await db.from('projects').insert({ id: projectId, project_title: 'Synthetic local QA' }));
  const specs = [
    ['comments', 'comments', { projectId, authorId: userId, comment: 'Synthetic local comment' }, 'comment', 'comment'],
    ['userAbsences', 'user_absences', { userId, absenceStartDate: '2026-12-01', absenceEndDate: '2026-12-01', reason: 'Other' }, 'absenceEndDate', 'absence_end_date'],
    ['projectRiskItems', 'project_risk_items', { projectId, title: 'Synthetic risk', probability: 2, impact: 2 }, 'title', 'title'],
    ['projectMaterials', 'project_materials', { projectId, description: 'Synthetic material', supplier: 'Synthetic supplier' }, 'description', 'description'],
    ['automationRules', 'automation_rules', { name: 'Synthetic rule', triggerType: 'task_created', actions: [], enabled: false }, 'name', 'name'],
  ] as const;
  for (const [field, table, values, property, column] of specs) {
    const id = randomUUID(); ids.push([table,id]);
    const row = { id, ...values };
    const version = await write(field,row);
    const editValue = field === 'userAbsences' ? '2026-12-02' : 'Edited local QA';
    const edited = { ...row, [property]: editValue, syncVersion: version };
    await write(field,edited);
    const saved = checked(await db.from(table).select('*').eq('id',id).single());
    assert.equal(saved[column], editValue);
    const stale = await writeDomainChanges({ [field]: [edited] } as unknown as ERPState,db);
    assert.equal(stale.status,409);
    checked(await db.from(table).delete().eq('id',id));
    assert.equal(checked(await db.from(table).select('id').eq('id',id)).length,0);
    console.log(`PASS local create/edit/read/conflict/delete: ${field}`);
  }
  const first = randomUUID(), broken = randomUUID(); ids.push(['comments',first],['comments',broken]);
  const result = await writeDomainChanges({ comments: [
    { id:first, projectId, authorId:userId, comment:'Must roll back' },
    { id:broken, projectId:randomUUID(), authorId:userId, comment:'Invalid FK' },
  ] } as unknown as ERPState,db);
  assert.equal(result.success,false);
  assert.equal(checked(await db.from('comments').select('id').in('id',[first,broken])).length,0);
  console.log('PASS local transaction rollback after FK failure');
} finally {
  for (const [table,id] of ids.reverse()) checked(await db.from(table).delete().eq('id',id));
  checked(await db.from('projects').delete().eq('id',projectId));
  checked(await db.from('users').delete().eq('id',userId));
  console.log('Local synthetic fixtures removed');
}
