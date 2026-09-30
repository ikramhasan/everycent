CREATE TABLE "budget_account" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"currency" char(3) NOT NULL,
	"interest_rate" numeric(6, 3),
	"minimum_payment" bigint,
	"escrow_amount" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payee" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"name" text NOT NULL,
	"internal_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"account_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"payee_id" text,
	"category_id" text,
	"memo" text DEFAULT '' NOT NULL,
	"cleared" text DEFAULT 'uncleared' NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "linked_account_id" text;--> statement-breakpoint
ALTER TABLE "category_group" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "budget_account" ADD CONSTRAINT "budget_account_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_budget_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_payee_id_payee_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_account_budget_id_idx" ON "budget_account" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "payee_budget_id_idx" ON "payee" USING btree ("budget_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payee_internal_kind_per_budget_idx" ON "payee" USING btree ("budget_id","internal_kind") WHERE "payee"."internal_kind" is not null;--> statement-breakpoint
CREATE INDEX "transaction_account_date_idx" ON "transaction" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transaction_budget_id_idx" ON "transaction" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "transaction_category_id_idx" ON "transaction" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_linked_account_id_budget_account_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_group_kind_per_budget_idx" ON "category_group" USING btree ("budget_id","kind") WHERE "category_group"."kind" is not null;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_linkedAccountId_unique" UNIQUE("linked_account_id");