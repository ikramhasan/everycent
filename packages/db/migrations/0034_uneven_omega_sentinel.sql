CREATE TABLE "fx_rate" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"rate_date" date NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"rate" numeric(30, 12) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rate_override" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"rate" numeric(30, 12) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fx_rate_override" ADD CONSTRAINT "fx_rate_override_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rate_date_base_quote_idx" ON "fx_rate" USING btree ("date","base","quote");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rate_override_budget_date_currency_idx" ON "fx_rate_override" USING btree ("budget_id","date","currency");