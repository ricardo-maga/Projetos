import { mock, spyOn } from 'bun:test';
import * as configuration from '../../lib/supabaseClient';
import * as serverClient from '../../lib/supabase/requireServerDbClient';
import * as ticketNumber from '../../lib/supabase/ticketNumber';

const originalConfiguration = { ...configuration };

// No real credentials or networking. Only the public configuration gate and
// the explicitly-injected server dependency are simulated for route unit tests.
export function installLegacyRouteHarness() {
  mock.module('../../lib/supabaseClient', () => ({ ...originalConfiguration, isSupabaseConfigured: true }));
  const server = spyOn(serverClient, 'requireServerDbClient').mockReturnValue({} as any);
  let sequence = 0;
  const number = spyOn(ticketNumber, 'reserveTicketNumber').mockImplementation(async () =>
    `TCK-${new Date().getFullYear()}-${String(++sequence).padStart(4, '0')}`);
  return () => {
    server.mockRestore();
    number.mockRestore();
    mock.module('../../lib/supabaseClient', () => originalConfiguration);
  };
}
