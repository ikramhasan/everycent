-- A changed split line stamps its transaction's updated_at too, so "changed since it was entered"
-- reads updated_at > created_at: every write of one request shares now(), so a split's or a
-- transfer's own follow-up writes on create don't count as a change (EVERYCENT-89).
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
  SET version = version + 1, updated_by_user_id = everycent_setting('actor_id'), updated_at = now()
  WHERE id = parent;
  RETURN NULL;
END $$;
