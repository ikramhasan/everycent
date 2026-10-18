CREATE TABLE "budget_email_preference" (
	"user_id" text NOT NULL,
	"budget_id" text NOT NULL,
	"monthly_summary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_email_preference_user_id_budget_id_pk" PRIMARY KEY("user_id","budget_id")
);
--> statement-breakpoint
CREATE TABLE "budget_monthly_summary" (
	"budget_id" text NOT NULL,
	"month" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_monthly_summary_budget_id_month_pk" PRIMARY KEY("budget_id","month")
);
--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "monthly_summary_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "monthly_summary_ai" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_email_preference" ADD CONSTRAINT "budget_email_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_email_preference" ADD CONSTRAINT "budget_email_preference_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_monthly_summary" ADD CONSTRAINT "budget_monthly_summary_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;