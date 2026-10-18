CREATE TABLE "ai_chat_interrupt" (
	"interrupt_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" bigint NOT NULL,
	"resolved_at" bigint,
	"payload" jsonb NOT NULL,
	"response" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_chat_run" (
	"run_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint,
	"error" text,
	"error_code" text,
	"usage" jsonb,
	"parent_run_id" text,
	"subagent_run_id" text,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "ai_chat_thread" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"messages" jsonb NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_run" (
	"tool_call_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget" ADD COLUMN "ai_assistant_button" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_chat_interrupt" ADD CONSTRAINT "ai_chat_interrupt_thread_id_ai_conversation_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_run" ADD CONSTRAINT "ai_chat_run_thread_id_ai_conversation_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_thread" ADD CONSTRAINT "ai_chat_thread_thread_id_ai_conversation_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_run" ADD CONSTRAINT "ai_tool_run_thread_id_ai_conversation_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_interrupt_thread_idx" ON "ai_chat_interrupt" USING btree ("thread_id","requested_at");--> statement-breakpoint
CREATE INDEX "ai_chat_interrupt_run_idx" ON "ai_chat_interrupt" USING btree ("run_id","requested_at");--> statement-breakpoint
CREATE INDEX "ai_chat_run_thread_idx" ON "ai_chat_run" USING btree ("thread_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_chat_run_parent_idx" ON "ai_chat_run" USING btree ("parent_run_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_conversation_list_idx" ON "ai_conversation" USING btree ("budget_id","user_id","updated_at");