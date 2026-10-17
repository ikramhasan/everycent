ALTER TABLE "payee" ADD COLUMN "auto_category_id" text;--> statement-breakpoint
ALTER TABLE "payee" ADD COLUMN "auto_category_saved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_auto_category_id_category_id_fk" FOREIGN KEY ("auto_category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;