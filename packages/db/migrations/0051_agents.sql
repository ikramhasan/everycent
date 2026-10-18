CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"host_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"mode" text DEFAULT 'delegated' NOT NULL,
	"public_key" text NOT NULL,
	"kid" text,
	"jwks_url" text,
	"last_used_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_capability_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"capability" text NOT NULL,
	"denied_by" text,
	"granted_by" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"constraints" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_host" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"user_id" text,
	"default_capabilities" text,
	"public_key" text,
	"kid" text,
	"jwks_url" text,
	"enrollment_token_hash" text,
	"enrollment_token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_request" (
	"id" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"agent_id" text,
	"host_id" text,
	"user_id" text,
	"capabilities" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_code_hash" text,
	"login_hint" text,
	"binding_message" text,
	"client_notification_token" text,
	"client_notification_endpoint" text,
	"delivery_mode" text,
	"interval" integer NOT NULL,
	"last_polled_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_agent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"revoked" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[] DEFAULT '{}',
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_clientId_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"revoked" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "created_by_agent_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "updated_by_agent_id" text;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "actor_agent_id" text;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_host_id_agent_host_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."agent_host"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_capability_grant" ADD CONSTRAINT "agent_capability_grant_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_capability_grant" ADD CONSTRAINT "agent_capability_grant_denied_by_user_id_fk" FOREIGN KEY ("denied_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_capability_grant" ADD CONSTRAINT "agent_capability_grant_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_host" ADD CONSTRAINT "agent_host_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_host_id_agent_host_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."agent_host"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_agent" ADD CONSTRAINT "connected_agent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_resource_id_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_user_id_idx" ON "agent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_host_id_idx" ON "agent" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "agent_kid_idx" ON "agent" USING btree ("kid");--> statement-breakpoint
CREATE INDEX "agent_status_idx" ON "agent" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_capability_grant_agent_id_idx" ON "agent_capability_grant" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_capability_grant_capability_idx" ON "agent_capability_grant" USING btree ("capability");--> statement-breakpoint
CREATE INDEX "agent_capability_grant_granted_by_idx" ON "agent_capability_grant" USING btree ("granted_by");--> statement-breakpoint
CREATE INDEX "agent_capability_grant_status_idx" ON "agent_capability_grant" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_host_user_id_idx" ON "agent_host" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_host_kid_idx" ON "agent_host" USING btree ("kid");--> statement-breakpoint
CREATE INDEX "agent_host_enrollment_token_hash_idx" ON "agent_host" USING btree ("enrollment_token_hash");--> statement-breakpoint
CREATE INDEX "agent_host_status_idx" ON "agent_host" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_request_agent_id_idx" ON "approval_request" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "approval_request_host_id_idx" ON "approval_request" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "approval_request_user_id_idx" ON "approval_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "approval_request_status_idx" ON "approval_request" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_agent_user_kind_external_idx" ON "connected_agent" USING btree ("user_id","kind","external_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_resource_client_resource_idx" ON "oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resource_resource_id_idx" ON "oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_client_id_idx" ON "oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_id_idx" ON "oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_authorization_code_id_idx" ON "oauth_refresh_token" USING btree ("authorization_code_id");--> statement-breakpoint
-- Agents (MCP clients and Agent Auth agents) act for a user. A request an agent makes also sets
--   everycent.agent_id   its connected_agent id (apps/api/src/lib/audit-context.ts)
-- and the change log, a transaction's entered/changed-by stamps and change notifications carry it
-- next to the user.
CREATE OR REPLACE FUNCTION everycent_meaningful(j jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT j - ARRAY['updated_at', 'version', 'created_by_user_id', 'updated_by_user_id',
    'created_by_agent_id', 'updated_by_agent_id', 'last_used_at']
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION everycent_stamp_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF everycent_setting('audit') = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    IF TG_TABLE_NAME = 'transaction' THEN
      -- A row inserted with its stamps already set (a restored backup) keeps them.
      IF NEW.created_by_user_id IS NULL THEN
        NEW.created_by_user_id := everycent_setting('actor_id');
        NEW.created_by_agent_id := everycent_setting('agent_id');
      END IF;
      NEW.updated_by_user_id := NEW.created_by_user_id;
      NEW.updated_by_agent_id := NEW.created_by_agent_id;
    END IF;
    RETURN NEW;
  END IF;
  -- An explicit bump (a split line changed, below) is kept as it is.
  IF NEW.version IS DISTINCT FROM OLD.version THEN RETURN NEW; END IF;
  IF everycent_meaningful(to_jsonb(NEW)) = everycent_meaningful(to_jsonb(OLD)) THEN
    RETURN NEW;
  END IF;
  NEW.version := OLD.version + 1;
  IF TG_TABLE_NAME = 'transaction' THEN
    NEW.updated_by_user_id := everycent_setting('actor_id');
    NEW.updated_by_agent_id := everycent_setting('agent_id');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION everycent_bump_parent() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent text;
BEGIN
  IF everycent_setting('audit') = 'off' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE'
    AND everycent_meaningful(to_jsonb(NEW)) = everycent_meaningful(to_jsonb(OLD)) THEN
    RETURN NULL;
  END IF;
  parent := CASE WHEN TG_OP = 'DELETE' THEN OLD.transaction_id ELSE NEW.transaction_id END;
  UPDATE "transaction"
  SET version = version + 1, updated_by_user_id = everycent_setting('actor_id'),
    updated_by_agent_id = everycent_setting('agent_id'), updated_at = now()
  WHERE id = parent;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION everycent_audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_j jsonb;
  new_j jsonb;
  rec jsonb;
  v_budget text;
  actor text := everycent_setting('actor_id');
  agent text := everycent_setting('agent_id');
  client text := everycent_setting('client_id');
BEGIN
  IF everycent_setting('audit') = 'off' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN old_j := to_jsonb(OLD) - 'token_hash'; END IF;
  IF TG_OP <> 'DELETE' THEN new_j := to_jsonb(NEW) - 'token_hash'; END IF;
  IF TG_OP = 'UPDATE' AND everycent_meaningful(old_j) = everycent_meaningful(new_j) THEN
    RETURN NULL;
  END IF;
  rec := coalesce(new_j, old_j);

  IF TG_ARGV[0] = 'id' THEN
    v_budget := rec->>'id';
    -- A deleted budget takes its history with it.
    IF TG_OP = 'DELETE' THEN
      DELETE FROM audit_event WHERE audit_event.budget_id = OLD.id;
      -- Its members' open event streams hear it, and end (EVERYCENT-90).
      PERFORM pg_notify('budget_change', json_build_object(
        'budgetId', v_budget, 'table', TG_TABLE_NAME, 'actorId', actor, 'agentId', agent, 'clientId', client
      )::text);
      RETURN NULL;
    END IF;
  ELSIF TG_ARGV[0] = 'budget_id' THEN
    v_budget := rec->>'budget_id';
  ELSIF TG_ARGV[0] = 'account_id' THEN
    SELECT a.budget_id INTO v_budget FROM budget_account a WHERE a.id = rec->>'account_id';
  ELSIF TG_ARGV[0] = 'transaction_id' THEN
    SELECT t.budget_id INTO v_budget FROM "transaction" t WHERE t.id = rec->>'transaction_id';
  ELSIF TG_ARGV[0] = 'scheduled_transaction_id' THEN
    SELECT s.budget_id INTO v_budget
    FROM scheduled_transaction s WHERE s.id = rec->>'scheduled_transaction_id';
  END IF;
  -- Rows removed by deleting their parent (a budget, account or transaction) aren't logged on
  -- their own: the parent's delete is, or the budget and its history are gone.
  IF v_budget IS NULL OR NOT EXISTS (SELECT 1 FROM budget b WHERE b.id = v_budget) THEN
    RETURN NULL;
  END IF;

  INSERT INTO audit_event (
    id, budget_id, actor_user_id, actor_agent_id, client_id, request_id, source,
    table_name, row_id, op, before, after, created_at
  ) VALUES (
    everycent_uuid_v7(), v_budget, actor, agent, client, everycent_setting('request_id'),
    everycent_setting('source'), TG_TABLE_NAME, rec->>'id', lower(TG_OP), old_j, new_j,
    clock_timestamp()
  );
  -- Identical payloads in one transaction are delivered once, at commit.
  PERFORM pg_notify('budget_change', json_build_object(
    'budgetId', v_budget, 'table', TG_TABLE_NAME, 'actorId', actor, 'agentId', agent, 'clientId', client
  )::text);
  RETURN NULL;
END $$;
