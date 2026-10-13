-- Only mortgages have escrow (YNAB's forms, phase 7f). Before 7f the form offered it for every
-- loan type; clear it elsewhere so those loans aren't charged escrow nobody can see.
UPDATE "budget_account" SET "escrow_amount" = NULL WHERE "type" <> 'mortgage' AND "escrow_amount" IS NOT NULL;
UPDATE "loan_terms" SET "escrow_amount" = NULL
  WHERE "escrow_amount" IS NOT NULL
    AND "account_id" IN (SELECT "id" FROM "budget_account" WHERE "type" <> 'mortgage');
