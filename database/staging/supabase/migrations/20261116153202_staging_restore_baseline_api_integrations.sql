CREATE TABLE IF NOT EXISTS "public"."api_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "permissions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "client_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "project_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    CONSTRAINT "api_integrations_key_hash_check" CHECK (("length"("key_hash") = 64)),
    CONSTRAINT "api_integrations_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 100))),
    CONSTRAINT "api_integrations_permissions" CHECK (("permissions" <@ ARRAY['projects:read'::"text", 'tasks:read'::"text"])),
    CONSTRAINT "api_integrations_rate_limit_per_minute_check" CHECK ((("rate_limit_per_minute" >= 1) AND ("rate_limit_per_minute" <= 600))),
    CONSTRAINT "api_integrations_scope_required" CHECK ((("cardinality"("client_ids") + "cardinality"("project_ids")) > 0))
);
ALTER TABLE ONLY "public"."api_integrations"
    ADD CONSTRAINT "api_integrations_key_hash_key" UNIQUE ("key_hash");
ALTER TABLE ONLY "public"."api_integrations"
    ADD CONSTRAINT "api_integrations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."api_integrations"
    ADD CONSTRAINT "api_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
CREATE INDEX IF NOT EXISTS api_integrations_active_idx ON public.api_integrations (expires_at) WHERE revoked_at IS NULL;
ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_integrations FROM anon,authenticated;
GRANT ALL ON public.api_integrations TO service_role;
NOTIFY pgrst,'reload schema';
