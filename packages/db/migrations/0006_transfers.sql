DROP INDEX "payee_name_per_budget_idx";--> statement-breakpoint
ALTER TABLE "payee" ADD COLUMN "transfer_account_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "transfer_transaction_id" text;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_transfer_account_id_budget_account_id_fk" FOREIGN KEY ("transfer_account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_transfer_transaction_id_transaction_id_fk" FOREIGN KEY ("transfer_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payee_transfer_account_idx" ON "payee" USING btree ("transfer_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_transfer_transaction_idx" ON "transaction" USING btree ("transfer_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payee_name_per_budget_idx" ON "payee" USING btree ("budget_id",lower("name")) WHERE "payee"."transfer_account_id" is null;