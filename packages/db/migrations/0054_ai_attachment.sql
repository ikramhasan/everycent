CREATE TABLE "ai_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_attachment" ADD CONSTRAINT "ai_attachment_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_attachment" ADD CONSTRAINT "ai_attachment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_attachment" ADD CONSTRAINT "ai_attachment_conversation_id_ai_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_attachment_conversation_idx" ON "ai_attachment" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_attachment_unsent_idx" ON "ai_attachment" USING btree ("created_at") WHERE "ai_attachment"."conversation_id" is null;--> statement-breakpoint
CREATE TRIGGER everycent_queue_storage_deletion AFTER DELETE ON ai_attachment
  FOR EACH ROW EXECUTE FUNCTION everycent_queue_storage_deletion();
