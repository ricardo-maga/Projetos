export type LocationKind = 'inherit' | 'site' | 'company' | 'remote' | 'unknown';
export interface Site { id: string; clientId: string; name: string; region: string | null;
  address: string | null; deleted?: boolean }
export interface TaskLocation { kind: LocationKind; siteId: string | null }
export interface ProjectLocation { clientId: string | null; defaultSiteId: string | null }
export interface LocationContext { kind: 'site' | 'company' | 'remote' | 'unknown' | 'indicative';
  label: string; siteId: string | null; region: string | null }

export function resolveLocation(task: TaskLocation, project: ProjectLocation | null,
  sites: Site[], clientLocation?: string | null): LocationContext {
  if (task.kind === 'company') return { kind: 'company', label: 'Na empresa', siteId: null, region: null };
  if (task.kind === 'remote') return { kind: 'remote', label: 'Remoto', siteId: null, region: null };
  if (task.kind === 'unknown') return { kind: 'unknown', label: 'Local desconhecido', siteId: null, region: null };
  const siteId = task.kind === 'site' ? task.siteId : project?.defaultSiteId;
  const site = sites.find(s => s.id === siteId && !s.deleted && s.clientId === project?.clientId);
  if (site) return { kind: 'site', label: site.name, siteId: site.id, region: site.region };
  if (task.kind === 'inherit' && clientLocation?.trim()) return {
    kind: 'indicative', label: `${clientLocation.trim()} (localização indicativa do cliente)`,
    siteId: null, region: null,
  };
  return { kind: 'unknown', label: 'Local desconhecido', siteId: null, region: null };
}

export function compareLocations(a: LocationContext, b: LocationContext) {
  if (a.kind === 'remote' || b.kind === 'remote' || a.kind === 'company' && b.kind === 'company')
    return 'travel_not_applicable' as const;
  if (a.kind !== 'site' || b.kind !== 'site') return 'unknown' as const;
  if (a.siteId === b.siteId) return 'same_site' as const;
  if (a.region && b.region && a.region !== b.region) return 'different_region' as const;
  return 'different_site' as const;
}
