CREATE TABLE "account_logo" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"budget_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_logo_accountId_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "user_avatar" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_avatar_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "account_logo" ADD CONSTRAINT "account_logo_account_id_budget_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."budget_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_logo" ADD CONSTRAINT "account_logo_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_avatar" ADD CONSTRAINT "user_avatar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Replaced or deleted logos and pictures (an account, budget or user deleted included) queue their
-- files for deletion, as attachments do (0048).
CREATE TRIGGER everycent_queue_storage_deletion AFTER DELETE ON account_logo
  FOR EACH ROW EXECUTE FUNCTION everycent_queue_storage_deletion();
--> statement-breakpoint
CREATE TRIGGER everycent_queue_storage_deletion AFTER DELETE ON user_avatar
  FOR EACH ROW EXECUTE FUNCTION everycent_queue_storage_deletion();
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON account_logo
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
