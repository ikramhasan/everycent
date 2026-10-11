CREATE TABLE "scheduled_sub_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduled_transaction_id" text NOT NULL,
	"sort_order" integer NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"payee_id" text,
	"category_id" text,
	"memo" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"account_id" text NOT NULL,
	"frequency" text NOT NULL,
	"date_first" date NOT NULL,
	"date_next" date NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"payee_id" text,
	"category_id" text,
	"memo" text DEFAULT '' NOT NULL,
	"flag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_sub_transaction" ADD CONSTRAINT "scheduled_sub_transaction_scheduled_transaction_id_scheduled_transaction_id_fk" FOREIGN KEY ("scheduled_transaction_id") REFERENCES "public"."scheduled_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_sub_transaction" ADD CONSTRAINT "scheduled_sub_transaction_payee_id_payee_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_sub_transaction" ADD CONSTRAINT "scheduled_sub_transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transaction" ADD CONSTRAINT "scheduled_transaction_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transaction" ADD CONSTRAINT "scheduled_transaction_account_id_budget_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transaction" ADD CONSTRAINT "scheduled_transaction_payee_id_payee_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transaction" ADD CONSTRAINT "scheduled_transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_sub_transaction_parent_idx" ON "scheduled_sub_transaction" USING btree ("scheduled_transaction_id");--> statement-breakpoint
CREATE INDEX "scheduled_sub_transaction_category_id_idx" ON "scheduled_sub_transaction" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "scheduled_transaction_budget_next_idx" ON "scheduled_transaction" USING btree ("budget_id","date_next");--> statement-breakpoint
CREATE INDEX "scheduled_transaction_account_id_idx" ON "scheduled_transaction" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "scheduled_transaction_category_id_idx" ON "scheduled_transaction" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "scheduled_transaction_payee_id_idx" ON "scheduled_transaction" USING btree ("payee_id");--> statement-breakpoint
-- Future-dated transactions become one-off scheduled transactions, as YNAB keeps them (EVERYCENT-4).
-- A transfer keeps one schedule, from its outflow side; the other account shows it negated, and
-- the category is whichever side has one. A split's lines come along, and its transfer lines'
-- other sides go with it. Cleared state and per-side memos and flags of other sides aren't kept.
INSERT INTO "scheduled_transaction" ("id", "budget_id", "account_id", "frequency", "date_first", "date_next", "amount", "currency", "payee_id", "category_id", "memo", "flag")
SELECT t."id", t."budget_id", t."account_id", 'never', t."date", t."date", t."amount", t."currency", t."payee_id", coalesce(t."category_id", o."category_id"), t."memo", t."flag"
FROM "transaction" t
LEFT JOIN "transaction" o ON o."id" = t."transfer_transaction_id"
WHERE t."date" > current_date
  AND t."transfer_sub_transaction_id" IS NULL
  AND (o."id" IS NULL OR (t."amount" < 0, t."id" < o."id") > (o."amount" < 0, o."id" < t."id"));--> statement-breakpoint
INSERT INTO "scheduled_sub_transaction" ("id", "scheduled_transaction_id", "sort_order", "amount", "currency", "payee_id", "category_id", "memo")
SELECT s."id", s."transaction_id", s."sort_order", s."amount", s."currency", s."payee_id", s."category_id", s."memo"
FROM "sub_transaction" s
JOIN "scheduled_transaction" st ON st."id" = s."transaction_id";--> statement-breakpoint
DELETE FROM "transaction"
WHERE "transfer_sub_transaction_id" IN (
  SELECT s."id" FROM "sub_transaction" s JOIN "scheduled_transaction" st ON st."id" = s."transaction_id"
);--> statement-breakpoint
DELETE FROM "transaction" WHERE "date" > current_date AND "transfer_sub_transaction_id" IS NULL;
