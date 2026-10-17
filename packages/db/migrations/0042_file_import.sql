CREATE TABLE "account_import_id" (
	"account_id" text NOT NULL,
	"import_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_import_id_account_id_import_id_pk" PRIMARY KEY("account_id","import_id")
);
--> statement-breakpoint
ALTER TABLE "budget_account" ADD COLUMN "csv_import_settings" jsonb;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "import_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "imported_payee" text;--> statement-breakpoint
ALTER TABLE "account_import_id" ADD CONSTRAINT "account_import_id_account_id_budget_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;