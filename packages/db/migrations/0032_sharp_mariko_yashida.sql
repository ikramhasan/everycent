CREATE TABLE "payee_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"payee_id" text NOT NULL,
	"operator" text NOT NULL,
	"text" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payee_rule" ADD CONSTRAINT "payee_rule_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_rule" ADD CONSTRAINT "payee_rule_payee_id_payee_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payee_rule_budget_id_idx" ON "payee_rule" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "payee_rule_payee_id_idx" ON "payee_rule" USING btree ("payee_id");