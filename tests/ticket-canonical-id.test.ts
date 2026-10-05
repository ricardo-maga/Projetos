import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
test('ticket creation returns the canonical UUID used by persistence and individual routes',()=>{
 const source=readFileSync(new URL('../app/api/v1/tickets/route.ts',import.meta.url),'utf8');
 expect(source).toContain('const id = crypto.randomUUID();');
 expect(source).not.toContain("const id = genId('tck')");
 expect(source).toContain('data: { ...newTicket, syncVersion:');
});
test('material PUT uses an allowlist and cannot set deletion or creation metadata',()=>{
 const source=readFileSync(new URL('../app/api/v1/project-materials/[id]/route.ts',import.meta.url),'utf8');
 const update=source.slice(source.indexOf('const mutableFields'),source.indexOf('const saveResult'));
 expect(update).toContain('...permittedUpdates');
 expect(update).not.toContain('...updates');
 expect(update).not.toContain("'deleted'");
 expect(update).not.toContain("'createdDate'");
 expect(source).toContain('currentState.projectMaterials[matIndex].deleted');
});
