CREATE TABLE "flag_name" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"color" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "flag" text;--> statement-breakpoint
ALTER TABLE "flag_name" ADD CONSTRAINT "flag_name_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flag_name_budget_color_idx" ON "flag_name" USING btree ("budget_id","color");