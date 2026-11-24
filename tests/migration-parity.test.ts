import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareMigrations } from '../scripts/migration-parity.mjs';
test('remote parity detects missing, unapplied and renamed versions', () => {
 const path=mkdtempSync(join(tmpdir(),'migration-parity-'));
 try {
  writeFileSync(join(path,'20260101000000_baseline.sql'),'-- baseline');
  expect(compareMigrations(path,[{version:'20260101000000',name:'baseline'}])).toEqual([]);
  expect(compareMigrations(path,[])).toHaveLength(1);
  expect(compareMigrations(path,[{version:'20260101000000',name:'other'}])).toHaveLength(1);
  expect(compareMigrations(path,[{version:'20260101000000',name:'baseline'},{version:'20260102000000',name:'new'}])).toHaveLength(1);
 } finally { rmSync(path,{recursive:true,force:true}); }
});
