import { expect, test } from 'bun:test';
import { profileEligibility } from '../lib/auth/profileEligibility';

test('profile eligibility fails closed for missing, deleted, pending and external profiles', () => {
  expect(profileEligibility(null)).toBe('deleted');
  expect(profileEligibility({ deleted: true, approved: true, type: 'Team' })).toBe('deleted');
  expect(profileEligibility({ deleted: false, approved: false, type: 'Team' })).toBe('pending');
  expect(profileEligibility({ deleted: false, approved: true, type: 'External' })).toBe('external');
  expect(profileEligibility({ deleted: false, approved: true, type: 'Team' })).toBe('active');
});
