CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"internal_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_group" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_group_id_category_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."category_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_group" ADD CONSTRAINT "category_group_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_budget_id_idx" ON "category" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "category_group_id_idx" ON "category" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_internal_kind_per_budget_idx" ON "category" USING btree ("budget_id","internal_kind") WHERE "category"."internal_kind" is not null;--> statement-breakpoint
CREATE INDEX "category_group_budget_id_idx" ON "category_group" USING btree ("budget_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_group_one_internal_per_budget_idx" ON "category_group" USING btree ("budget_id") WHERE "category_group"."internal";