CREATE TABLE "month_note" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"month" date NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "month_note" ADD CONSTRAINT "month_note_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "month_note_budget_month_idx" ON "month_note" USING btree ("budget_id","month");