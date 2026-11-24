import { Badge } from '@/components/ui/Badge';
import { countsTowardsPlanning } from '@/domains/tasks/modules/taskPlanning';
import type { TaskPlanningStatus } from '@/lib/types';

export function TaskPlanningBadge({ planningStatus, compact = false }: { planningStatus?: TaskPlanningStatus; compact?: boolean }) {
  if (countsTowardsPlanning({ planningStatus })) return null;
  return <Badge variant="warning" title="Provisória" className={compact ? 'px-1 py-0' : undefined}>
    {compact ? <><span aria-hidden="true">P</span><span className="sr-only">Provisória</span></> : 'Provisória'}
  </Badge>;
}
