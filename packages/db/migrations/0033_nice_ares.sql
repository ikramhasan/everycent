ALTER TABLE "payee" ADD COLUMN "categorization" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "payee" ADD COLUMN "default_category_id" text;--> statement-breakpoint
ALTER TABLE "payee" ADD COLUMN "carried_category_id" text;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_default_category_id_category_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_carried_category_id_category_id_fk" FOREIGN KEY ("carried_category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;