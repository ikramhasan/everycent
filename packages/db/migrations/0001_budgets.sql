CREATE TABLE "budget" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"currency" char(3) NOT NULL,
	"number_format" text NOT NULL,
	"currency_symbol_position" text NOT NULL,
	"date_format" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "budget_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_member" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_budget_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "budget_invitation" ADD CONSTRAINT "budget_invitation_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_invitation" ADD CONSTRAINT "budget_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_member" ADD CONSTRAINT "budget_member_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_member" ADD CONSTRAINT "budget_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_last_budget_id_budget_id_fk" FOREIGN KEY ("last_budget_id") REFERENCES "public"."budget"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_invitation_budget_id_idx" ON "budget_invitation" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "budget_invitation_email_idx" ON "budget_invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_member_budget_user_idx" ON "budget_member" USING btree ("budget_id","user_id");--> statement-breakpoint
CREATE INDEX "budget_member_user_id_idx" ON "budget_member" USING btree ("user_id");