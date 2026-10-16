DROP INDEX "transaction_budget_id_idx";--> statement-breakpoint
CREATE INDEX "transaction_budget_date_idx" ON "transaction" USING btree ("budget_id","date");