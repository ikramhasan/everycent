CREATE TABLE "loan_charge" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"month" date NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"month" date NOT NULL,
	"interest_rate" numeric(6, 3),
	"minimum_payment" bigint,
	"escrow_amount" bigint,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_account" ADD COLUMN "paired_category_id" text;--> statement-breakpoint
ALTER TABLE "loan_charge" ADD CONSTRAINT "loan_charge_account_id_budget_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_terms" ADD CONSTRAINT "loan_terms_account_id_budget_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loan_charge_account_month_kind_idx" ON "loan_charge" USING btree ("account_id","month","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_terms_account_month_idx" ON "loan_terms" USING btree ("account_id","month");--> statement-breakpoint
ALTER TABLE "budget_account" ADD CONSTRAINT "budget_account_paired_category_id_category_id_fk" FOREIGN KEY ("paired_category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_account_paired_category_idx" ON "budget_account" USING btree ("paired_category_id");