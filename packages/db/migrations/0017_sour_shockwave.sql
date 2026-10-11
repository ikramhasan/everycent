ALTER TABLE "money_move" DROP CONSTRAINT "money_move_from_category_id_category_id_fk";
--> statement-breakpoint
ALTER TABLE "money_move" DROP CONSTRAINT "money_move_to_category_id_category_id_fk";
--> statement-breakpoint
ALTER TABLE "money_move" ALTER COLUMN "from_category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "money_move" ALTER COLUMN "to_category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "money_move" ADD COLUMN "from_category_name" text;--> statement-breakpoint
ALTER TABLE "money_move" ADD COLUMN "to_category_name" text;--> statement-breakpoint
ALTER TABLE "money_move" ADD COLUMN "deletion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "money_move" ADD CONSTRAINT "money_move_from_category_id_category_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_move" ADD CONSTRAINT "money_move_to_category_id_category_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;