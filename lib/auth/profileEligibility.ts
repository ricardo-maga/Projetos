export type ProfileEligibility = 'active' | 'deleted' | 'pending' | 'external';

/** One eligibility rule for login and every authenticated API request. */
export function profileEligibility(profile: {
  deleted?: boolean | null;
  approved?: boolean | null;
  type?: string | null;
} | null | undefined): ProfileEligibility {
  if (!profile || profile.deleted) return 'deleted';
  if (!profile.approved) return 'pending';
  if (profile.type === 'External') return 'external';
  return 'active';
}
