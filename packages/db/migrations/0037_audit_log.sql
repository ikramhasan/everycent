CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"actor_user_id" text,
	"client_id" text,
	"request_id" text,
	"source" text,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"op" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "updated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "category_assignment" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_event_budget_created_idx" ON "audit_event" USING btree ("budget_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_row_idx" ON "audit_event" USING btree ("table_name","row_id");