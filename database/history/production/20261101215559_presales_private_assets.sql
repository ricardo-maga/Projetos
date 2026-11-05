-- Images remain private. Documents refer to stable asset IDs, never signed URLs.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('presales-assets','presales-assets',FALSE,10485760,
  ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT(id) DO NOTHING;
CREATE TABLE public.presales_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.presales_details(request_id) ON DELETE RESTRICT,
 storage_path text NOT NULL UNIQUE,
 filename text NOT NULL,
 media_type text NOT NULL CHECK (media_type IN ('image/png','image/jpeg','image/webp')),
 uploaded_by uuid NOT NULL REFERENCES public.users(id),
 uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX presales_assets_request_idx ON public.presales_assets(request_id);
ALTER TABLE public.presales_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presales_assets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.presales_assets TO service_role;

-- Publication checks that every image belongs to this proposal. This trigger
-- is also the final guard if a new writer is added outside presales_mutate.
CREATE FUNCTION public.guard_presales_revision_assets() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE b jsonb;
BEGIN
 FOR b IN SELECT value FROM jsonb_array_elements(NEW.document_snapshot->'blocks') LOOP
   IF b->>'type'='image' AND NOT EXISTS (
     SELECT 1 FROM public.presales_assets a WHERE a.id=(b->>'assetId')::uuid
       AND a.request_id=NEW.request_id) THEN
     RAISE EXCEPTION 'A imagem não pertence a este Presales.' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_presales_revision_assets BEFORE INSERT ON public.presales_document_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_presales_revision_assets();
REVOKE ALL ON FUNCTION public.guard_presales_revision_assets() FROM PUBLIC,anon,authenticated;

;
