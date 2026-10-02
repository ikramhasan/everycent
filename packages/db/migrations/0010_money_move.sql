CREATE TABLE "money_move" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"user_id" text,
	"from_category_id" text NOT NULL,
	"to_category_id" text NOT NULL,
	"month" date NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_move" ADD CONSTRAINT "money_move_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_move" ADD CONSTRAINT "money_move_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_move" ADD CONSTRAINT "money_move_from_category_id_category_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_move" ADD CONSTRAINT "money_move_to_category_id_category_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "money_move_budget_created_idx" ON "money_move" USING btree ("budget_id","created_at");