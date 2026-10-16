-- The budget change log (EVERYCENT-108), row versions (EVERYCENT-36), who entered a transaction
-- (EVERYCENT-89) and change notifications for live updates (EVERYCENT-90), all from triggers so
-- every write is covered, in the same transaction as the change.
--
-- A request sets its context with set_config(..., true) (apps/api/src/lib/audit-context.ts):
--   everycent.actor_id   the signed-in user making the change
--   everycent.client_id  the browser tab (X-Client-Id), so it can skip its own notifications
--   everycent.request_id the request id
--   everycent.source     why a change without an actor happened (e.g. "scheduled")
--   everycent.audit      "off" skips logging and stamping (purging a deleted user's ids)

-- UUIDv7 (RFC 9562) as text, like the app's newId(): a 48-bit millisecond time, then random bits.
CREATE FUNCTION everycent_uuid_v7() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  b bytea := uuid_send(gen_random_uuid());
  ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
BEGIN
  b := overlay(b PLACING substring(int8send(ms) FROM 3) FROM 1 FOR 6);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  RETURN encode(b, 'hex')::uuid::text;
END $$;
--> statement-breakpoint
CREATE FUNCTION everycent_setting(name text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('everycent.' || name, true), '') $$;
--> statement-breakpoint
-- Columns whose changes alone aren't a change worth logging or versioning.
CREATE FUNCTION everycent_meaningful(j jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT j - ARRAY['updated_at', 'version', 'created_by_user_id', 'updated_by_user_id', 'last_used_at']
$$;
--> statement-breakpoint
-- BEFORE: bumps the row version on a real change and stamps who entered or changed a transaction.
CREATE FUNCTION everycent_stamp_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF everycent_setting('audit') = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    IF TG_TABLE_NAME = 'transaction' THEN
      NEW.created_by_user_id := coalesce(NEW.created_by_user_id, everycent_setting('actor_id'));
      NEW.updated_by_user_id := NEW.created_by_user_id;
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
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- AFTER on sub_transaction: a changed split line is a change to its transaction's version.
CREATE FUNCTION everycent_bump_parent() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent text;
BEGIN
  IF everycent_setting('audit') = 'off' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE'
    AND everycent_meaningful(to_jsonb(NEW)) = everycent_meaningful(to_jsonb(OLD)) THEN
    RETURN NULL;
  END IF;
  parent := CASE WHEN TG_OP = 'DELETE' THEN OLD.transaction_id ELSE NEW.transaction_id END;
  UPDATE "transaction" SET version = version + 1, updated_by_user_id = everycent_setting('actor_id')
  WHERE id = parent;
  RETURN NULL;
END $$;
--> statement-breakpoint
-- AFTER: logs the change and notifies listeners. TG_ARGV[0] says how the row finds its budget.
CREATE FUNCTION everycent_audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_j jsonb;
  new_j jsonb;
  rec jsonb;
  v_budget text;
  actor text := everycent_setting('actor_id');
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
    id, budget_id, actor_user_id, client_id, request_id, source,
    table_name, row_id, op, before, after, created_at
  ) VALUES (
    everycent_uuid_v7(), v_budget, actor, client, everycent_setting('request_id'),
    everycent_setting('source'), TG_TABLE_NAME, rec->>'id', lower(TG_OP), old_j, new_j,
    clock_timestamp()
  );
  -- Identical payloads in one transaction are delivered once, at commit.
  PERFORM pg_notify('budget_change', json_build_object(
    'budgetId', v_budget, 'table', TG_TABLE_NAME, 'actorId', actor, 'clientId', client
  )::text);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER everycent_stamp BEFORE INSERT OR UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION everycent_stamp_row();
--> statement-breakpoint
CREATE TRIGGER everycent_stamp BEFORE INSERT OR UPDATE ON category_assignment
  FOR EACH ROW EXECUTE FUNCTION everycent_stamp_row();
--> statement-breakpoint
CREATE TRIGGER everycent_bump_parent AFTER INSERT OR UPDATE OR DELETE ON sub_transaction
  FOR EACH ROW EXECUTE FUNCTION everycent_bump_parent();
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON budget
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON budget_member
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON budget_invitation
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON budget_account
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON loan_terms
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('account_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON loan_charge
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('account_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON payee
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON payee_rule
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON flag_name
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON sub_transaction
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('transaction_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON scheduled_transaction
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON scheduled_sub_transaction
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('scheduled_transaction_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON category_group
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON category
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON category_assignment
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON category_target
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON month_note
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON budget_view
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON fx_rate_override
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
