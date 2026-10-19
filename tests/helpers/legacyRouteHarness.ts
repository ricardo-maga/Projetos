import { mock, spyOn } from 'bun:test';
import * as configuration from '../../lib/supabaseClient';
import * as serverClient from '../../lib/supabase/requireServerDbClient';

const originalConfiguration = { ...configuration };

// No real credentials or networking. Only the public configuration gate and
// the explicitly-injected server dependency are simulated for route unit tests.
export function installLegacyRouteHarness(databaseClient: any = {}) {
  mock.module('../../lib/supabaseClient', () => ({ ...originalConfiguration, isSupabaseConfigured: true }));
  const server = spyOn(serverClient, 'requireServerDbClient').mockReturnValue(databaseClient);
  return () => {
    server.mockRestore();
    mock.module('../../lib/supabaseClient', () => originalConfiguration);
  };
}
