-- Every existing account is in the budget's currency, so the base amount is the amount.
ALTER TABLE "sub_transaction" ADD COLUMN "base_amount" bigint;--> statement-breakpoint
UPDATE "sub_transaction" SET "base_amount" = "amount";--> statement-breakpoint
ALTER TABLE "sub_transaction" ALTER COLUMN "base_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "base_amount" bigint;--> statement-breakpoint
UPDATE "transaction" SET "base_amount" = "amount";--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "base_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "fx_rate" numeric(30, 12);--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "fx_rate_manual" boolean DEFAULT false NOT NULL;
