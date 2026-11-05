-- Notifications and individual read receipts remain backend-only resources.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON public.notification_reads(user_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access to auth users on notifications" ON public.notifications;
DROP POLICY IF EXISTS "rbac notifications read" ON public.notifications;
DROP POLICY IF EXISTS "rbac notifications create" ON public.notifications;
DROP POLICY IF EXISTS "backend_only_no_direct_api" ON public.notifications;
DROP POLICY IF EXISTS "rbac notification reads own" ON public.notification_reads;
DROP POLICY IF EXISTS "rbac notification reads create" ON public.notification_reads;
DROP POLICY IF EXISTS "backend_only_no_direct_api" ON public.notification_reads;

CREATE POLICY "backend_only_no_direct_api" ON public.notifications
  FOR ALL TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY "backend_only_no_direct_api" ON public.notification_reads
  FOR ALL TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);

REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_reads FROM anon, authenticated;
