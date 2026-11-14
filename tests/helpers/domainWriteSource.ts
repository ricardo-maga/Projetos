import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export function domainWriteSource() {
  const files = ['lib/supabase/writeDomainChanges.ts',
    'domains/configuration/services/writeConfiguration.ts',
    'domains/projects/services/writeProjectMaterials.ts',
    'domains/projects/services/writeProjectRisks.ts',
    'domains/people/services/writePeopleActivity.ts',
    'domains/communication/services/writeNotifications.ts',
    'domains/communication/services/writeAutomationRules.ts'];
  return files.map(file => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
}
