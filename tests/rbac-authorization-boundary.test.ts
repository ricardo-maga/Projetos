import { expect, test, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';
import * as auth from '../lib/auth/requireAuth';
import * as database from '../lib/supabase/requireServerDbClient';
import { authorizeRbac } from '../lib/rbac/admin';

test('RBAC obtains a privileged database client only after the central permission check', async () => {
  const req = new NextRequest('http://localhost/api/rbac/roles');
  const permission = spyOn(auth, 'requirePermission').mockRejectedValueOnce(new auth.ForbiddenError());
  const client = spyOn(database, 'requireServerDbClient').mockReturnValue({} as ReturnType<typeof database.requireServerDbClient>);
  try {
    await expect(authorizeRbac(req, 'roles.manage')).rejects.toBeInstanceOf(auth.ForbiddenError);
    expect(permission).toHaveBeenCalledWith(req, 'roles.manage');
    expect(client).not.toHaveBeenCalled();
  } finally {
    permission.mockRestore();
    client.mockRestore();
  }
});
