-- Makes existing installations compatible with Supabase Auth.  This is safe to
-- run when the users table predates migration 002.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id_unique
  ON public.users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Link profiles only where the auth identity has the exact same normalized
-- email and is not already attached to another profile. Review this result in
-- a staging environment before production if duplicate emails exist.
UPDATE public.users AS profile
SET auth_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE profile.auth_user_id IS NULL
  AND lower(profile.email) = lower(auth_user.email)
  AND NOT EXISTS (
    SELECT 1 FROM public.users AS linked
    WHERE linked.auth_user_id = auth_user.id
  );
