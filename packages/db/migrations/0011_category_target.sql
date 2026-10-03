CREATE TABLE "category_target" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"category_id" text NOT NULL,
	"cadence" text NOT NULL,
	"behavior" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"due_day" integer,
	"start_month" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_target_categoryId_unique" UNIQUE("category_id")
);
--> statement-breakpoint
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_target_budget_id_idx" ON "category_target" USING btree ("budget_id");