CREATE TABLE "sub_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
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
ALTER TABLE "transaction" ADD COLUMN "transfer_sub_transaction_id" text;--> statement-breakpoint
ALTER TABLE "sub_transaction" ADD CONSTRAINT "sub_transaction_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_transaction" ADD CONSTRAINT "sub_transaction_payee_id_payee_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_transaction" ADD CONSTRAINT "sub_transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sub_transaction_transaction_id_idx" ON "sub_transaction" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "sub_transaction_category_id_idx" ON "sub_transaction" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_transfer_sub_transaction_id_sub_transaction_id_fk" FOREIGN KEY ("transfer_sub_transaction_id") REFERENCES "public"."sub_transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_transfer_sub_transaction_idx" ON "transaction" USING btree ("transfer_sub_transaction_id");