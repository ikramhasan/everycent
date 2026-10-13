ALTER TABLE "budget_invitation" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_invitation" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "budget_invitation" ADD CONSTRAINT "budget_invitation_tokenHash_unique" UNIQUE("token_hash");