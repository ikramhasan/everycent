ALTER TABLE "budget_account" ADD COLUMN "paid_off_banner_dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget" ADD COLUMN "loan_simulator_banner_dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "money_move" ADD COLUMN "auto_assign_batch_id" text;--> statement-breakpoint
ALTER TABLE "money_move" ADD COLUMN "auto_assign_method" text;