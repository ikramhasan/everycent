-- A deleted budget notifies its event streams (they skipped it: the delete returned before
-- pg_notify, and the cascaded member rows find no budget), so its members' streams end.
CREATE OR REPLACE FUNCTION everycent_audit_row() RETURNS trigger
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
      -- Its members' open event streams hear it, and end (EVERYCENT-90).
      PERFORM pg_notify('budget_change', json_build_object(
        'budgetId', v_budget, 'table', TG_TABLE_NAME, 'actorId', actor, 'clientId', client
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
