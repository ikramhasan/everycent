CREATE TABLE "ai_tool_run" (
	"tool_call_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_tool_run" ADD CONSTRAINT "ai_tool_run_thread_id_ai_conversation_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;